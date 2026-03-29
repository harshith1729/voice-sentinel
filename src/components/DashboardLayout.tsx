import { useState } from 'react';
import { NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import {
  LayoutDashboard, Activity, Clock, Settings, LogOut, Shield,
  Wifi, WifiOff, ChevronLeft, ChevronRight, Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/dashboard/monitor', icon: Activity, label: 'Live Monitor' },
  { to: '/dashboard/history', icon: Clock, label: 'History' },
  { to: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

const DashboardLayout = ({ children }: Props) => {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* User info */}
      <div className={cn("p-4 border-b border-border", collapsed && "p-2")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-sm">
              {(profile?.full_name || user?.email || 'U')[0].toUpperCase()}
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => (
          <RouterNavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              collapsed && "justify-center px-2"
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </RouterNavLink>
        ))}
      </nav>

      {/* Status + Logout */}
      <div className={cn("p-4 border-t border-border space-y-3", collapsed && "p-2")}>
        {!collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-muted-foreground">System Online</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {profile?.esp32_ip ? (
                <><Wifi className="w-3 h-3 text-primary" /><span className="text-muted-foreground">ESP32 Configured</span></>
              ) : (
                <><WifiOff className="w-3 h-3 text-danger" /><span className="text-muted-foreground">No Hardware</span></>
              )}
            </div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout}
          className={cn("w-full text-muted-foreground hover:text-danger", collapsed && "p-2")}>
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="ml-2">Logout</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static z-50 h-screen bg-sidebar border-r border-border transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        mobileOpen ? "left-0" : "-left-64 md:left-0"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              <span className="font-bold text-sm">Deepfake Guard</span>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="hidden md:block text-muted-foreground hover:text-foreground">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* Main */}
      <main className="flex-1 min-h-screen overflow-auto">
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 md:hidden flex items-center gap-3">
          <button onClick={() => setMobileOpen(true)}><Menu className="w-5 h-5" /></button>
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm">Deepfake Guard</span>
        </header>
        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
