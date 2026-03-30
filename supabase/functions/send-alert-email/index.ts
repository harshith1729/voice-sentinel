import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "alerts@deepfakeguard.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fakeDetectedHtml(name: string, timestamp: string, confidence: string, inputType: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0e1117;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#FF4B4B;padding:16px;border-radius:8px 8px 0 0;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:20px;">⚠️ SECURITY ALERT</h1>
    </div>
    <div style="background:#161b22;padding:30px;border:1px solid #30363d;border-top:none;border-radius:0 0 8px 8px;">
      <p style="color:#e6edf3;font-size:16px;">Hello ${name},</p>
      <p style="color:#8b949e;font-size:14px;line-height:1.6;">
        A <strong style="color:#FF4B4B;">FAKE voice</strong> has been detected on your Deepfake Guard account.
      </p>
      <div style="background:#0e1117;border:1px solid #30363d;border-radius:8px;padding:16px;margin:20px 0;">
        <table style="width:100%;color:#8b949e;font-size:13px;">
          <tr><td style="padding:6px 0;">Timestamp</td><td style="text-align:right;color:#e6edf3;">${timestamp}</td></tr>
          <tr><td style="padding:6px 0;">Confidence</td><td style="text-align:right;color:#FF4B4B;font-weight:bold;">${confidence}%</td></tr>
          <tr><td style="padding:6px 0;">Input Type</td><td style="text-align:right;color:#e6edf3;text-transform:capitalize;">${inputType}</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://deepfakeguard.com/history" style="background:#FF4B4B;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">Review Activity</a>
      </div>
      <p style="color:#484f58;font-size:12px;margin-top:30px;border-top:1px solid #30363d;padding-top:16px;">
        If this was you, ignore this message. If not, change your PIN immediately.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function suspiciousDetectedHtml(name: string, timestamp: string, confidence: string, inputType: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0e1117;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#FFD700;padding:16px;border-radius:8px 8px 0 0;text-align:center;">
      <h1 style="color:#0e1117;margin:0;font-size:20px;">⚠️ SUSPICIOUS ACTIVITY</h1>
    </div>
    <div style="background:#161b22;padding:30px;border:1px solid #30363d;border-top:none;border-radius:0 0 8px 8px;">
      <p style="color:#e6edf3;font-size:16px;">Hello ${name},</p>
      <p style="color:#8b949e;font-size:14px;line-height:1.6;">
        A <strong style="color:#FFD700;">suspicious voice</strong> pattern was detected on your account.
      </p>
      <div style="background:#0e1117;border:1px solid #30363d;border-radius:8px;padding:16px;margin:20px 0;">
        <table style="width:100%;color:#8b949e;font-size:13px;">
          <tr><td style="padding:6px 0;">Timestamp</td><td style="text-align:right;color:#e6edf3;">${timestamp}</td></tr>
          <tr><td style="padding:6px 0;">Confidence</td><td style="text-align:right;color:#FFD700;font-weight:bold;">${confidence}%</td></tr>
          <tr><td style="padding:6px 0;">Input Type</td><td style="text-align:right;color:#e6edf3;text-transform:capitalize;">${inputType}</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://deepfakeguard.com/dashboard" style="background:#FFD700;color:#0e1117;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">Check Dashboard</a>
      </div>
      <p style="color:#484f58;font-size:12px;margin-top:30px;border-top:1px solid #30363d;padding-top:16px;">
        If this was you, ignore this message. If not, change your PIN immediately.
      </p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recipientEmail, recipientName, result, confidence, inputType, isTest } = await req.json();

    if (!recipientEmail || (!result && !isTest)) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = recipientName || "User";
    const timestamp = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const conf = isTest ? "95.2" : ((confidence || 0) * 100).toFixed(1);
    const type = inputType || "live";

    let subject: string;
    let html: string;

    if (isTest) {
      subject = "🧪 Deepfake Guard — Test Alert Email";
      html = fakeDetectedHtml(name, timestamp, conf, "test");
    } else if (result === "FAKE") {
      subject = "🚨 Deepfake Alert — Fake Voice Detected on Your Account";
      html = fakeDetectedHtml(name, timestamp, conf, type);
    } else if (result === "SUSPICIOUS") {
      subject = "⚠️ Deepfake Guard — Suspicious Voice Activity";
      html = suspiciousDetectedHtml(name, timestamp, conf, type);
    } else {
      return new Response(JSON.stringify({ error: "No alert needed for this result" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Deepfake Guard <${FROM_EMAIL}>`,
        to: [recipientEmail],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(JSON.stringify({ error: "Failed to send email", details: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
