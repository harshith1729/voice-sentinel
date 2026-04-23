#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>

const char* ssid = "Harshith";
const char* password = "23071A6937";

WebServer server(80);
Servo myServo;

// Pins
const int servoPin  = 18;
const int greenLed  = 14;
const int redLed    = 27;
const int yellowLed = 12;
const int buzzerPin = 26;

// Track fallback state
bool fallbackWaiting = false;
int wrongPinAttempts = 0;          // ← NEW: track attempts on ESP32 side
const int MAX_PIN_ATTEMPTS = 3;    // ← NEW: max before lockout

// =============================
// RESET SYSTEM
// =============================
void resetSystem() {
  digitalWrite(greenLed, LOW);
  digitalWrite(redLed, LOW);
  digitalWrite(yellowLed, LOW);
  digitalWrite(buzzerPin, LOW);
  myServo.write(0);
  fallbackWaiting = false;
  wrongPinAttempts = 0;            // ← NEW: reset counter on full reset
}

// =============================
// STATES
// =============================
void triggerReal() {
  resetSystem();
  digitalWrite(greenLed, HIGH);
  myServo.write(180);
  Serial.println("REAL -> GREEN ON + SERVO UNLOCK");
}

void triggerFake() {
  resetSystem();
  digitalWrite(redLed, HIGH);
  digitalWrite(buzzerPin, HIGH);
  myServo.write(0);
  Serial.println("FAKE -> RED + BUZZER");
}

void triggerFallback() {
  // Don't call resetSystem() here — preserve wrongPinAttempts if re-entering fallback
  digitalWrite(greenLed, LOW);
  digitalWrite(redLed, LOW);
  digitalWrite(yellowLed, HIGH);
  digitalWrite(buzzerPin, LOW);
  myServo.write(0);

  fallbackWaiting = true;
  wrongPinAttempts = 0;            // ← Reset attempts fresh for each new FALLBACK trigger

  // Short beep to signal fallback activated
  digitalWrite(buzzerPin, HIGH);
  delay(150);
  digitalWrite(buzzerPin, LOW);

  Serial.println("FALLBACK -> YELLOW ON (waiting PIN)");
}

// =============================
// WRONG PIN — short warning beep, stay on yellow
// =============================
void triggerWrongPinWarning() {
  // Keep yellow LED on, do NOT turn red
  // Just give a short double-beep as warning
  digitalWrite(buzzerPin, HIGH);
  delay(100);
  digitalWrite(buzzerPin, LOW);
  delay(100);
  digitalWrite(buzzerPin, HIGH);
  delay(100);
  digitalWrite(buzzerPin, LOW);

  Serial.print("WRONG PIN WARNING — attempt ");
  Serial.print(wrongPinAttempts);
  Serial.print(" of ");
  Serial.println(MAX_PIN_ATTEMPTS);
}

// =============================
// PIN RESULT HANDLER
// =============================
void handlePinResult() {
  if (!server.hasArg("status")) {
    server.send(400, "text/plain", "Missing status");
    return;
  }

  String status = server.arg("status");

  if (!fallbackWaiting) {
    server.send(200, "text/plain", "No fallback active");
    return;
  }

  if (status == "success") {
    // ✅ Correct PIN → green + servo unlock
    triggerReal();
    Serial.println("PIN CORRECT -> ACCESS GRANTED");
    server.send(200, "text/plain", "PIN Correct -> Access Granted");

  } else {
    // ❌ Wrong PIN
    wrongPinAttempts++;            // ← Increment counter

    if (wrongPinAttempts >= MAX_PIN_ATTEMPTS) {
      // 🔴 Max attempts reached → full lockout
      triggerFake();
      Serial.println("MAX ATTEMPTS REACHED -> LOCKOUT");
      server.send(200, "text/plain", "Max attempts reached -> Locked out");
    } else {
      // ⚠️ Still have attempts left → just warn, keep yellow
      triggerWrongPinWarning();
      server.send(200, "text/plain", "Wrong PIN - attempts remaining");
    }
  }
}

// =============================
// MAIN ANALYSIS HANDLER
// =============================
void handleUnlock() {
  if (!server.hasArg("state") || !server.hasArg("confidence")) {
    server.send(400, "text/plain", "Missing params");
    return;
  }

  int state = server.arg("state").toInt();
  float confidence = server.arg("confidence").toFloat();

  Serial.println("\n=======================");
  Serial.print("State: ");
  Serial.println(state == 0 ? "REAL" : (state == 1 ? "FAKE" : "FALLBACK"));
  Serial.print("Confidence: ");
  Serial.println(confidence);
  Serial.println("=======================");

  if (state == 1) {
    triggerFake();
  } else if (state == 0) {
    triggerReal();
  } else {
    triggerFallback();
  }

  server.send(200, "text/plain", "OK");
}

// =============================
// RESET HANDLER
// =============================
void handleLock() {
  resetSystem();
  server.send(200, "text/plain", "Reset Done");
}

// =============================
// SETUP
// =============================
void setup() {
  Serial.begin(115200);

  pinMode(greenLed, OUTPUT);
  pinMode(redLed, OUTPUT);
  pinMode(yellowLed, OUTPUT);
  pinMode(buzzerPin, OUTPUT);

  ESP32PWM::allocateTimer(0);
  myServo.setPeriodHertz(50);
  myServo.attach(servoPin, 500, 2400);

  resetSystem();

  WiFi.begin(ssid, password);
  Serial.print("Connecting");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  server.on("/unlock", handleUnlock);
  server.on("/lock", handleLock);
  server.on("/pin_result", handlePinResult);
  server.begin();
}

// =============================
// LOOP
// =============================
void loop() {
  server.handleClient();
}