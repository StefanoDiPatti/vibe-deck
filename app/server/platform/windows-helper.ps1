$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$stdout.AutoFlush = $true

function Send-Reply($obj) {
  $stdout.WriteLine('@@DOCK ' + (ConvertTo-Json -InputObject $obj -Compress -Depth 6))
}

Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class DockInput {
  [StructLayout(LayoutKind.Sequential)]
  struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  struct INPUT { public uint type; public UNION u; }

  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

  const uint KEYUP = 0x2;
  const uint UNICODE = 0x4;
  const uint EXTENDED = 0x1;

  static bool IsExtended(ushort vk) {
    return (vk >= 0x21 && vk <= 0x2E) || (vk >= 0x5B && vk <= 0x5D) || (vk >= 0xA6 && vk <= 0xB7) || vk == 0x6F || vk == 0x90;
  }

  static INPUT Key(ushort vk, bool up) {
    INPUT i = new INPUT();
    i.type = 1;
    i.u.ki.wVk = vk;
    i.u.ki.dwFlags = (up ? KEYUP : 0) | (IsExtended(vk) ? EXTENDED : 0);
    return i;
  }

  static uint Send(INPUT[] list) {
    return SendInput((uint)list.Length, list, Marshal.SizeOf(typeof(INPUT)));
  }

  public static uint Combo(ushort[] vks) {
    INPUT[] list = new INPUT[vks.Length * 2];
    for (int k = 0; k < vks.Length; k++) list[k] = Key(vks[k], false);
    for (int k = 0; k < vks.Length; k++) list[vks.Length + k] = Key(vks[vks.Length - 1 - k], true);
    return Send(list);
  }

  public static uint Text(string s) {
    System.Collections.Generic.List<INPUT> list = new System.Collections.Generic.List<INPUT>();
    foreach (char ch in s) {
      if (ch == '\r') continue;
      if (ch == '\n') { list.Add(Key(0x0D, false)); list.Add(Key(0x0D, true)); continue; }
      INPUT d = new INPUT(); d.type = 1; d.u.ki.wScan = ch; d.u.ki.dwFlags = UNICODE;
      INPUT u = new INPUT(); u.type = 1; u.u.ki.wScan = ch; u.u.ki.dwFlags = UNICODE | KEYUP;
      list.Add(d); list.Add(u);
    }
    if (list.Count == 0) return 0;
    return Send(list.ToArray());
  }

  public static bool Focus(string processName) {
    IntPtr h = IntPtr.Zero;
    foreach (Process p in Process.GetProcessesByName(processName)) {
      if (p.MainWindowHandle != IntPtr.Zero) { h = p.MainWindowHandle; break; }
    }
    return FocusWindow(h);
  }

  public static bool FocusWindow(IntPtr h) {
    if (h == IntPtr.Zero) return false;
    if (GetForegroundWindow() == h) return true;
    if (IsIconic(h)) ShowWindow(h, 9);
    Combo(new ushort[] { 0x10 });
    uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    bool attached = fg != me && AttachThreadInput(me, fg, true);
    BringWindowToTop(h);
    bool ok = SetForegroundWindow(h);
    if (attached) AttachThreadInput(me, fg, false);
    return ok || GetForegroundWindow() == h;
  }
}

public static class DockWindows {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);

  class Win { public IntPtr h; public string proc; public string title; }

  static System.Collections.Generic.List<Win> All() {
    var list = new System.Collections.Generic.List<Win>();
    var names = new System.Collections.Generic.Dictionary<uint, string>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      int len = GetWindowTextLength(h);
      if (len == 0) return true;
      var sb = new System.Text.StringBuilder(len + 1);
      GetWindowText(h, sb, sb.Capacity);
      uint pid; GetWindowThreadProcessId(h, out pid);
      string name;
      if (!names.TryGetValue(pid, out name)) {
        try { name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { name = ""; }
        names[pid] = name;
      }
      list.Add(new Win { h = h, proc = name, title = sb.ToString() });
      return true;
    }, IntPtr.Zero);
    return list;
  }

  public static string[] List() {
    var outp = new System.Collections.Generic.List<string>();
    foreach (var w in All()) outp.Add(w.proc + "\t" + w.title);
    return outp.ToArray();
  }

  public static int Close(string process, string titlePattern) {
    int n = 0;
    var re = string.IsNullOrEmpty(titlePattern) ? null : new System.Text.RegularExpressions.Regex(titlePattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    foreach (var w in All()) {
      if (w.proc != process.ToLowerInvariant()) continue;
      if (re != null && !re.IsMatch(w.title)) continue;
      if (PostMessage(w.h, 0x0010, IntPtr.Zero, IntPtr.Zero)) n++;
    }
    return n;
  }
}
"@

$script:screens = $false
try {
  Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class DockScreens {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct MONITORINFOEX { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }
  delegate bool MonEnum(IntPtr h, IntPtr hdc, ref RECT r, IntPtr d);
  delegate bool WinEnum(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonEnum f, IntPtr d);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr h, ref MONITORINFOEX mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string dev, uint i, ref DISPLAY_DEVICE dd, uint flags);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool EnumWindows(WinEnum f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int v, int size);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);

  static void Aware() { try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { } }

  static string Clean(string s) { return (s ?? "").Replace("\t", " ").Replace("\n", " ").Replace("\r", ""); }

  public static string[] Monitors() {
    Aware();
    var list = new System.Collections.Generic.List<string>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate (IntPtr h, IntPtr hdc, ref RECT r, IntPtr d) {
      var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
      if (!GetMonitorInfo(h, ref mi)) return true;
      var dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
      string hw = "";
      if (EnumDisplayDevices(mi.szDevice, 0, ref dd, 1)) hw = dd.DeviceID ?? "";
      RECT m = mi.rcMonitor, w = mi.rcWork;
      list.Add(mi.szDevice + "\t" + ((mi.dwFlags & 1) != 0 ? "1" : "0") + "\t" +
        m.L + " " + m.T + " " + (m.R - m.L) + " " + (m.B - m.T) + "\t" +
        w.L + " " + w.T + " " + (w.R - w.L) + " " + (w.B - w.T) + "\t" + hw);
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }

  static string MonitorOf(IntPtr h) {
    var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
    IntPtr mon = MonitorFromWindow(h, 2);
    return GetMonitorInfo(mon, ref mi) ? mi.szDevice : "";
  }

  static bool Listed(IntPtr h) { return Listed(h, false); }

  static bool Listed(IntPtr h, bool shellCloak) {
    if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return false;
    int ex = GetWindowLong(h, -20);
    if ((ex & 0x80) != 0) return false;
    int cloaked;
    if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0 && !(shellCloak && cloaked == 2)) return false;
    if (GetWindowTextLength(h) == 0) return false;
    var cls = new StringBuilder(64); GetClassName(h, cls, 64);
    string c = cls.ToString();
    return c != "Progman" && c != "WorkerW" && c != "Shell_TrayWnd" && c != "Shell_SecondaryTrayWnd";
  }

  public static string[] Windows() {
    Aware();
    var list = new System.Collections.Generic.List<string>();
    var names = new System.Collections.Generic.Dictionary<uint, string>();
    IntPtr fg = GetForegroundWindow();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!Listed(h)) return true;
      int len = GetWindowTextLength(h);
      var sb = new StringBuilder(len + 1); GetWindowText(h, sb, sb.Capacity);
      uint pid; GetWindowThreadProcessId(h, out pid);
      string name;
      if (!names.TryGetValue(pid, out name)) {
        try { name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { name = ""; }
        names[pid] = name;
      }
      if (name == "textinputhost") return true;
      RECT r;
      if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r);
      string st = IsIconic(h) ? "m" : IsZoomed(h) ? "M" : "n";
      list.Add(h.ToInt64() + "\t" + pid + "\t" + name + "\t" + st + "\t" + MonitorOf(h) + "\t" +
        r.L + " " + r.T + " " + (r.R - r.L) + " " + (r.B - r.T) + "\t" + (h == fg ? "1" : "0") + "\t" + Clean(sb.ToString()));
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }

  [ComImport, Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IVirtualDesktopManager {
    [PreserveSig] int IsWindowOnCurrentVirtualDesktop(IntPtr h, out int on);
    [PreserveSig] int GetWindowDesktopId(IntPtr h, out Guid id);
    [PreserveSig] int MoveWindowToDesktop(IntPtr h, ref Guid id);
  }
  static IVirtualDesktopManager vdm;

  public static string[] DeskWindows() {
    Aware();
    if (vdm == null) vdm = (IVirtualDesktopManager)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a")));
    var list = new System.Collections.Generic.List<string>();
    var names = new System.Collections.Generic.Dictionary<uint, string>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!Listed(h, true)) return true;
      Guid d;
      if (vdm.GetWindowDesktopId(h, out d) != 0 || d == Guid.Empty) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      string name;
      if (!names.TryGetValue(pid, out name)) {
        try { name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { name = ""; }
        names[pid] = name;
      }
      if (name == "textinputhost") return true;
      int len = GetWindowTextLength(h);
      var sb = new StringBuilder(len + 1); GetWindowText(h, sb, sb.Capacity);
      RECT r;
      if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r);
      string st = IsIconic(h) ? "m" : IsZoomed(h) ? "M" : "n";
      list.Add(h.ToInt64() + "\t" + d.ToString().ToUpperInvariant() + "\t" + st + "\t" + MonitorOf(h) + "\t" +
        r.L + " " + r.T + " " + (r.R - r.L) + " " + (r.B - r.T) + "\t" + name + "\t" + Clean(sb.ToString()));
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }

  static IntPtr Check(long hwnd) {
    IntPtr h = new IntPtr(hwnd);
    if (!IsWindow(h) || !Listed(h)) throw new Exception("finestra non trovata (chiusa?)");
    return h;
  }

  public static bool Place(long hwnd, int x, int y, int w, int hh, bool max, bool activate) {
    Aware();
    IntPtr h = Check(hwnd);
    if (IsIconic(h) || IsZoomed(h)) ShowWindow(h, activate ? 9 : 4);
    bool ok = true;
    for (int pass = 0; pass < 2; pass++) {
      RECT wr, fr;
      int l = 0, t = 0, r = 0, b = 0;
      if (GetWindowRect(h, out wr) && DwmGetWindowAttribute(h, 9, out fr, 16) == 0) {
        l = fr.L - wr.L; t = fr.T - wr.T; r = wr.R - fr.R; b = wr.B - fr.B;
      }
      ok = SetWindowPos(h, IntPtr.Zero, x - l, y - t, w + l + r, hh + t + b, 0x0004 | 0x0010 | 0x0040) && ok;
    }
    if (max) ShowWindow(h, 3);
    return ok;
  }

  public static IntPtr Handle(long hwnd) { return Check(hwnd); }
  public static IntPtr Foreground() { return GetForegroundWindow(); }

  public static bool Act(long hwnd, string what) {
    Aware();
    IntPtr h = Check(hwnd);
    switch (what) {
      case "minimize": return ShowWindow(h, 6) || true;
      case "maximize": return ShowWindow(h, 3) || true;
      case "restore": return ShowWindow(h, 9) || true;
    }
    throw new Exception("azione sconosciuta: " + what);
  }
}
"@
  $script:screens = $true
} catch { [Console]::Error.WriteLine('schermi non disponibili: ' + $_.Exception.Message) }

$script:appAudio = $false
try {
  Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class DockAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int NotImpl1();
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice dev);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  }
  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int NotImpl1(); int NotImpl2();
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
  }
  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int n);
    [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s);
  }
  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int N0(); int N1(); int N2(); int N3(); int N4(); int N5(); int N6(); int N7(); int N8();
    int N9(); int N10();
    [PreserveSig] int GetProcessId(out uint pid);
  }
  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float level, ref Guid ctx);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  static IAudioSessionEnumerator Sessions() {
    IMMDeviceEnumerator en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
    IMMDevice dev;
    int hr = en.GetDefaultAudioEndpoint(0, 1, out dev);
    if (hr != 0) throw new Exception("GetDefaultAudioEndpoint 0x" + hr.ToString("X"));
    Guid iid = typeof(IAudioSessionManager2).GUID;
    object o;
    hr = dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    if (hr != 0) throw new Exception("Activate 0x" + hr.ToString("X"));
    IAudioSessionEnumerator list;
    hr = ((IAudioSessionManager2)o).GetSessionEnumerator(out list);
    if (hr != 0) throw new Exception("GetSessionEnumerator 0x" + hr.ToString("X"));
    return list;
  }

  public static string[] ListProcesses() {
    IAudioSessionEnumerator list = Sessions();
    int count; list.GetCount(out count);
    System.Collections.Generic.List<string> names = new System.Collections.Generic.List<string>();
    for (int i = 0; i < count; i++) {
      IAudioSessionControl2 ctl;
      if (list.GetSession(i, out ctl) != 0 || ctl == null) continue;
      uint pid; ctl.GetProcessId(out pid);
      if (pid == 0) continue;
      try { names.Add(Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant()); } catch { }
    }
    return names.ToArray();
  }

  public static float Adjust(string[] names, float delta, int mute) {
    IAudioSessionEnumerator list = Sessions();
    int count; list.GetCount(out count);
    float result = -1;
    Guid ctx = Guid.Empty;
    for (int i = 0; i < count; i++) {
      IAudioSessionControl2 ctl;
      if (list.GetSession(i, out ctl) != 0 || ctl == null) continue;
      uint pid; ctl.GetProcessId(out pid);
      if (pid == 0) continue;
      string pname;
      try { pname = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { continue; }
      bool match = false;
      foreach (string n in names) if (pname == n.ToLowerInvariant()) { match = true; break; }
      if (!match) continue;
      ISimpleAudioVolume vol = (ISimpleAudioVolume)ctl;
      float level; vol.GetMasterVolume(out level);
      if (delta != 0) {
        level = Math.Max(0f, Math.Min(1f, level + delta));
        vol.SetMasterVolume(level, ref ctx);
      }
      if (mute >= 0) {
        bool m; vol.GetMute(out m);
        vol.SetMute(mute == 2 ? !m : mute == 1, ref ctx);
      }
      result = level;
    }
    return result;
  }
}
"@
  $script:appAudio = $true
} catch { }

$script:mixer = $false
. (Join-Path $PSScriptRoot 'windows-mixer.ps1')

$script:winrt = $false
$script:mgr = $null
$script:thumb = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  [void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $script:winrt = $true
} catch { }

function Await($op, [Type]$type) {
  $task = $script:asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $task.Wait(4000)) { throw 'timeout WinRT' }
  return $task.Result
}

$script:thumbs = @{}

function Get-Manager {
  if ($null -eq $script:mgr) {
    $script:mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  }
  return $script:mgr
}

function Find-Session([string]$app) {
  foreach ($s in (Get-Manager).GetSessions()) {
    if ([string]$s.SourceAppUserModelId -eq $app) { return $s }
  }
  return $null
}

function Get-Sessions {
  if (-not $script:winrt) { return @{ supported = $false; sessions = @() } }
  $mgr = Get-Manager
  $cur = $mgr.GetCurrentSession()
  $curId = ''
  if ($null -ne $cur) { $curId = [string]$cur.SourceAppUserModelId }
  $list = @()
  $thumbs = @{}
  foreach ($s in $mgr.GetSessions()) {
    try {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $pb = $s.GetPlaybackInfo()
      $tl = $s.GetTimelineProperties()
      $app = [string]$s.SourceAppUserModelId
      $thumbs[$app] = $p.Thumbnail
      $list += @{
        app = $app
        current = ($app -eq $curId)
        title = [string]$p.Title
        artist = [string]$p.Artist
        album = [string]$p.AlbumTitle
        status = [string]$pb.PlaybackStatus
        start = [double]$tl.StartTime.TotalSeconds
        end = [double]$tl.EndTime.TotalSeconds
        position = [double]$tl.Position.TotalSeconds
        updatedAt = [double]$tl.LastUpdatedTime.ToUnixTimeMilliseconds()
        hasArt = ($null -ne $p.Thumbnail)
        canSeek = [bool]$pb.Controls.IsPlaybackPositionEnabled
        canShuffle = [bool]$pb.Controls.IsShuffleEnabled
        shuffle = [bool]$pb.IsShuffleActive
        repeat = [string]$pb.AutoRepeatMode
      }
    } catch { }
  }
  $script:thumbs = $thumbs
  return @{ supported = $true; sessions = $list }
}

function Invoke-Control($req) {
  $s = Find-Session ([string]$req.app)
  if ($null -eq $s) { throw 'sessione non trovata' }
  switch ([string]$req.action) {
    'play_pause' { $op = $s.TryTogglePlayPauseAsync() }
    'next' { $op = $s.TrySkipNextAsync() }
    'previous' { $op = $s.TrySkipPreviousAsync() }
    'stop' { $op = $s.TryStopAsync() }
    'seek' { $op = $s.TryChangePlaybackPositionAsync([long]([double]$req.position * 10000000)) }
    'shuffle' { $op = $s.TryChangeShuffleActiveAsync([bool]$req.value) }
    default { throw ('azione sconosciuta: ' + $req.action) }
  }
  return @{ done = [bool](Await $op ([bool])) }
}

function Get-Art($req) {
  $thumb = $null
  if ($req.app -and $script:thumbs.ContainsKey([string]$req.app)) { $thumb = $script:thumbs[[string]$req.app] }
  if ($null -eq $thumb) { return @{ ok = $false } }
  $stream = Await ($thumb.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  try {
    $m = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [type[]]@([Windows.Storage.Streams.IInputStream]))
    $net = $m.Invoke($null, @($stream))
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    $net.Dispose()
    if ($ms.Length -eq 0 -or $ms.Length -gt 4MB) { return @{ ok = $false } }
    $bytes = $ms.ToArray()
    $mime = 'image/jpeg'
    if ($bytes.Length -gt 3 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { $mime = 'image/png' }
    return @{ ok = $true; mime = $mime; data = [Convert]::ToBase64String($bytes) }
  } finally { try { ([System.IDisposable]$stream).Dispose() } catch { } }
}

function Get-Net {
  $rx = [double]0; $tx = [double]0
  foreach ($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($n.OperationalStatus -ne 'Up') { continue }
    $t = [string]$n.NetworkInterfaceType
    if ($t -eq 'Loopback' -or $t -eq 'Tunnel') { continue }
    if (($n.Name + ' ' + $n.Description) -match 'vEthernet|Hyper-V|VirtualBox|VMware|WSL|Loopback|Bluetooth') { continue }
    $st = $n.GetIPStatistics()
    $rx += $st.BytesReceived; $tx += $st.BytesSent
  }
  return @{ rx = $rx; tx = $tx }
}

function Get-NetInfo {
  $best = $null
  foreach ($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($n.OperationalStatus -ne 'Up') { continue }
    $t = [string]$n.NetworkInterfaceType
    if ($t -eq 'Loopback' -or $t -eq 'Tunnel') { continue }
    if (($n.Name + ' ' + $n.Description) -match 'vEthernet|Hyper-V|VirtualBox|VMware|WSL|Loopback|Bluetooth|TAP|VPN') { continue }
    $gw = @($n.GetIPProperties().GatewayAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' })
    if ($gw.Count -eq 0) { continue }
    $best = $n
    break
  }
  if ($null -eq $best) { return @{ type = 'none'; name = '' } }
  if ([string]$best.NetworkInterfaceType -eq 'Wireless80211') {
    $ssid = ''
    $signal = $null
    foreach ($l in (netsh.exe wlan show interfaces)) {
      if ($l -match '^\s*SSID\s*:\s*(.+)$') { $ssid = $Matches[1].Trim() }
      elseif ($l -match ':\s*(\d+)\s*%\s*$') { $signal = [int]$Matches[1] }
    }
    return @{ type = 'wifi'; name = $ssid; signal = $signal }
  }
  return @{ type = 'ethernet'; name = 'Ethernet' }
}

$script:monitorNames = $null
function Get-MonitorNames {
  if ($null -ne $script:monitorNames) { return $script:monitorNames }
  $out = @()
  try {
    foreach ($m in (Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction Stop)) {
      $name = (($m.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join '').Trim()
      if ($name) { $out += ([string]$m.InstanceName + "`t" + $name) }
    }
  } catch { }
  $script:monitorNames = $out
  return $out
}

$script:uia = $false
$script:SEND = @('Invia', 'Send', 'Envoyer', 'Senden', 'Enviar')
$script:STOP = @('Interrompi', 'Stop', 'Arrêter', 'Stoppen', 'Detener')
$script:TRUST_CANCEL = @('Annulla', 'Cancel')
function Use-Uia {
  if (-not $script:uia) { Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes; $script:uia = $true }
}
function Get-ClaudeWin {
  Use-Uia
  $p = Get-Process claude -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($null -eq $p) { return $null }
  return [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
}
function Find-Uia($root, [string]$prop, $value, [string]$type) {
  $AE = [System.Windows.Automation.AutomationElement]
  $conds = @()
  if ($prop -eq 'name') { $conds += New-Object System.Windows.Automation.PropertyCondition ($AE::NameProperty, [string]$value) }
  if ($type) { $conds += New-Object System.Windows.Automation.PropertyCondition ($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::$type) }
  $cond = if ($conds.Count -eq 1) { $conds[0] } else { New-Object System.Windows.Automation.AndCondition ([System.Windows.Automation.Condition[]]$conds) }
  return $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
}
function First-Button($win, $names) {
  foreach ($n in $names) {
    $b = Find-Uia $win 'name' $n 'Button'
    if ($b.Count -gt 0) { return $b[0] }
  }
  return $null
}
function Get-ClaudeView {
  $win = Get-ClaudeWin
  if ($null -eq $win) { return @{ app = $false } }
  $titles = @()
  foreach ($tb in (Find-Uia $win '' $null 'ToolBar')) {
    foreach ($t in $tb.FindAll([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)))) {
      if ($t.Current.Name) { $titles += [string]$t.Current.Name }
    }
  }
  $ed = Find-Uia $win 'name' 'Prompt' 'Edit'
  $draft = ''
  if ($ed.Count -gt 0) { try { $draft = [string]$ed[0].GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { } }
  return @{
    app = $true
    titles = $titles
    composer = ($ed.Count -gt 0)
    draft = $draft.Trim()
    canSend = ($null -ne (First-Button $win $script:SEND))
    busy = ($null -ne (First-Button $win $script:STOP))
    trustDialog = ($null -ne (First-Button $win @("Considera attendibile l'area di lavoro", 'Trust workspace')))
  }
}
function Assert-ClaudeTitle($win, [string]$title) {
  if (-not $title) { return }
  foreach ($tb in (Find-Uia $win '' $null 'ToolBar')) {
    if ((Find-Uia $tb 'name' $title 'Text').Count -gt 0) { return }
  }
  throw 'sull''app di Claude e'' aperta un''altra sessione'
}
function Send-ClaudeText($req) {
  $win = Get-ClaudeWin
  if ($null -eq $win) { throw 'app di Claude chiusa' }
  Assert-ClaudeTitle $win ([string]$req.title)
  $ed = Find-Uia $win 'name' 'Prompt' 'Edit'
  if ($ed.Count -eq 0) { throw 'campo di scrittura non trovato' }
  $vp = $ed[0].GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  if (([string]$vp.Current.Value).Trim()) { throw 'sul PC c''e'' gia'' del testo scritto in questa sessione' }
  if ($null -ne (First-Button $win $script:STOP)) { throw 'occupata' }
  $vp.SetValue([string]$req.text)
  $send = $null
  for ($i = 0; $i -lt 8 -and $null -eq $send; $i++) { Start-Sleep -Milliseconds 200; $send = First-Button $win $script:SEND }
  if ($null -eq $send) { $vp.SetValue(''); throw 'pulsante Invia non disponibile' }
  $send.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  return @{ sent = $true }
}
function Stop-ClaudeTurn($req) {
  $win = Get-ClaudeWin
  if ($null -eq $win) { throw 'app di Claude chiusa' }
  Assert-ClaudeTitle $win ([string]$req.title)
  $b = First-Button $win $script:STOP
  if ($null -eq $b) { return @{ stopped = $false } }
  $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  return @{ stopped = $true }
}
function New-ClaudeSessionIn($req) {
  $win = Get-ClaudeWin
  if ($null -eq $win) { throw 'app di Claude chiusa' }
  $group = [string]$req.group; $project = [string]$req.project
  foreach ($b in (Find-Uia $win '' $null 'Button')) {
    $n = [string]$b.Current.Name
    $ok = $false
    if ($group) { $ok = ($n -match '^(Nuova sessione|New session) in .+, (aggiunta a|added to) (.+)$') -and ($Matches[3] -eq $group) }
    else { $ok = ($n -eq ('Nuova sessione in ' + $project)) -or ($n -eq ('New session in ' + $project)) }
    if ($ok) { $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return @{ clicked = $n } }
  }
  throw 'pulsante per la nuova sessione non trovato nella barra laterale'
}

function Close-ClaudeTrust {
  $win = Get-ClaudeWin
  if ($null -eq $win) { return @{ closed = $false } }
  $b = First-Button $win $script:TRUST_CANCEL
  if ($null -ne $b) { $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return @{ closed = $true } }
  return @{ closed = $false }
}

$script:vdx = $false
function Use-Vdx {
  if ($script:vdx) { return }
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DockVD {
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIInspectable), Guid("372E1D3B-38D3-42E4-A15B-8AB2B178F513")]
  public interface IApplicationView { }
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("1841C6D7-4F9D-42C0-AF41-8747538F10E5")]
  public interface IApplicationViewCollection {
    int GetViews(out IntPtr a); int GetViewsByZOrder(out IntPtr a); int GetViewsByAppUserModelId(string s, out IntPtr a);
    int GetViewForHwnd(IntPtr hwnd, out IApplicationView view);
  }
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("3F07F4BE-B107-441A-AF0F-39D82529072C")]
  public interface IVirtualDesktop { bool IsViewVisible(IApplicationView view); Guid GetId(); }
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("53F5CA0B-158F-4124-900C-057158060B27")]
  public interface IVirtualDesktopManagerInternal {
    int GetCount();
    void MoveViewToDesktop(IApplicationView view, IVirtualDesktop desktop);
    bool CanViewMoveDesktops(IApplicationView view);
    IVirtualDesktop GetCurrentDesktop();
    void GetDesktops(out IntPtr desktops);
    [PreserveSig] int GetAdjacentDesktop(IVirtualDesktop from, int direction, out IVirtualDesktop desktop);
    void SwitchDesktop(IVirtualDesktop desktop);
    void SwitchDesktopAndMoveForegroundView(IVirtualDesktop desktop);
    IVirtualDesktop CreateDesktop();
    void MoveDesktop(IVirtualDesktop desktop, int index);
    void RemoveDesktop(IVirtualDesktop desktop, IVirtualDesktop fallback);
    IVirtualDesktop FindDesktop(ref Guid desktopId);
  }
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("6D5140C1-7436-11CE-8034-00AA006009FA")]
  public interface IServiceProvider10 { [return: MarshalAs(UnmanagedType.IUnknown)] object QueryService(ref Guid service, ref Guid riid); }
  static IVirtualDesktopManagerInternal mgr;
  static IApplicationViewCollection views;
  static void Init() {
    if (mgr != null) return;
    var shell = (IServiceProvider10)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("C2F03A33-21F5-47FA-B4BB-156362A2F239")));
    Guid s1 = new Guid("C5E0CDCA-7B6E-41B2-9FC4-D93975CC467B"), i1 = typeof(IVirtualDesktopManagerInternal).GUID;
    mgr = (IVirtualDesktopManagerInternal)shell.QueryService(ref s1, ref i1);
    Guid i2 = typeof(IApplicationViewCollection).GUID;
    views = (IApplicationViewCollection)shell.QueryService(ref i2, ref i2);
  }
  public static string Move(long hwnd, string desk) {
    try { Init(); } catch (Exception e) { mgr = null; throw new Exception("desktop virtuali non raggiungibili su questa versione di Windows (" + e.Message + ")"); }
    IApplicationView view;
    if (views.GetViewForHwnd(new IntPtr(hwnd), out view) != 0 || view == null) throw new Exception("finestra non trovata tra quelle di Windows");
    if (!mgr.CanViewMoveDesktops(view)) throw new Exception("Windows non permette di spostare questa finestra su un altro desktop");
    IVirtualDesktop target;
    if (String.IsNullOrEmpty(desk)) target = mgr.CreateDesktop();
    else { Guid g = new Guid(desk); target = mgr.FindDesktop(ref g); }
    mgr.MoveViewToDesktop(view, target);
    return target.GetId().ToString().ToUpperInvariant();
  }
}
"@
  $script:vdx = $true
}
function Move-ToDesktop($req) {
  Use-Vdx
  $desk = [string]$req.desk
  return @{ moved = $true; desk = [DockVD]::Move([long]$req.hwnd, $desk) }
}

function Open-Target($req) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = [string]$req.file
  if ($req.args) { $psi.Arguments = [string]$req.args }
  if ($req.cwd) { $psi.WorkingDirectory = [string]$req.cwd }
  $psi.UseShellExecute = $true
  [void][System.Diagnostics.Process]::Start($psi)
  return @{ started = $true }
}

Send-Reply @{ id = 0; ready = $true; winrt = $script:winrt; appAudio = $script:appAudio; screens = $script:screens }

while ($true) {
  $line = $stdin.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim() -eq '') { continue }
  $id = $null
  try {
    $req = ConvertFrom-Json $line
    $id = $req.id
    switch ([string]$req.cmd) {
      'ping' { $data = @{ pong = $true } }
      'keys' { $data = @{ sent = [DockInput]::Combo([uint16[]]@($req.vks)) } }
      'text' { $data = @{ sent = [DockInput]::Text([string]$req.text) } }
      'focus' { $data = @{ focused = [DockInput]::Focus([string]$req.name) } }
      'open' { $data = Open-Target $req }
      'sessions' { $data = Get-Sessions }
      'control' { $data = Invoke-Control $req }
      'art' { $data = Get-Art $req }
      'appvolume' {
        if (-not $script:appAudio) { throw 'volume per app non disponibile' }
        $data = @{ level = [DockAudio]::Adjust([string[]]@($req.names), [float]$req.delta, [int]$req.mute) }
      }
      'audiosessions' { $data = @{ processes = @([DockAudio]::ListProcesses()) } }
      'mixer' {
        if (-not $script:mixer) { throw 'mixer non disponibile' }
        $data = @{ devices = @([DockMixer]::Devices()); sessions = @([DockMixer]::Sessions()) }
      }
      'mixdefault' { [DockMixer]::SetDefault([string]$req.dev); $data = @{ done = $true } }
      'mixdevice' { [DockMixer]::SetDevice([string]$req.dev, [float]$req.level, [int]$req.mute); $data = @{ done = $true } }
      'mixapp' { $data = @{ done = [DockMixer]::SetApp([uint32]$req.pid, [float]$req.level, [int]$req.mute) } }
      'net' { $data = Get-Net }
      'netinfo' { $data = Get-NetInfo }
      'windows' { $data = @{ list = @([DockWindows]::List()) } }
      'closewin' { $data = @{ closed = [DockWindows]::Close([string]$req.process, [string]$req.title) } }
      'claudeview' { $data = Get-ClaudeView }
      'claudesend' { $data = Send-ClaudeText $req }
      'claudestop' { $data = Stop-ClaudeTurn $req }
      'claudetrust' { $data = Close-ClaudeTrust }
      'claudenew' { $data = New-ClaudeSessionIn $req }
      'monitors' {
        if (-not $script:screens) { throw 'schermi non disponibili' }
        $data = @{ list = @([DockScreens]::Monitors()); names = @(Get-MonitorNames) }
      }
      'winlist' {
        if (-not $script:screens) { throw 'schermi non disponibili' }
        $data = @{ list = @([DockScreens]::Windows()) }
      }
      'deskwins' {
        if (-not $script:screens) { throw 'schermi non disponibili' }
        $data = @{ list = @([DockScreens]::DeskWindows()) }
      }
      'vdreg' {
        $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops'
        $hex = { param($b) if ($b) { ($b | ForEach-Object { $_.ToString('X2') }) -join '' } else { '' } }
        $p = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue
        $cur = & $hex $p.CurrentVirtualDesktop
        if (-not $cur) {
          Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\SessionInfo' -ErrorAction SilentlyContinue | ForEach-Object {
            $s = Get-ItemProperty -Path (Join-Path $_.PSPath 'VirtualDesktops') -ErrorAction SilentlyContinue
            if (-not $cur -and $s.CurrentVirtualDesktop) { $cur = & $hex $s.CurrentVirtualDesktop }
          }
        }
        $names = @{}
        Get-ChildItem (Join-Path $k 'Desktops') -ErrorAction SilentlyContinue | ForEach-Object {
          $n = (Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue).Name
          if ($n) { $names[$_.PSChildName.Trim('{', '}').ToUpper()] = [string]$n }
        }
        $data = @{ ids = (& $hex $p.VirtualDesktopIDs); cur = $cur; names = $names }
      }
      'place' {
        if (-not $script:screens) { throw 'schermi non disponibili' }
        $fg = [DockScreens]::Foreground()
        $data = @{ moved = [DockScreens]::Place([long]$req.hwnd, [int]$req.x, [int]$req.y, [int]$req.w, [int]$req.h, [bool]$req.max, [bool]$req.focus) }
        if ($req.focus) { [void][DockInput]::FocusWindow([DockScreens]::Handle([long]$req.hwnd)) }
        elseif ($fg -ne [IntPtr]::Zero -and [DockScreens]::Foreground() -ne $fg) { [void][DockInput]::FocusWindow($fg) }
      }
      'vdmove' {
        if (-not $script:screens) { throw 'schermi non disponibili' }
        $data = Move-ToDesktop $req
      }
      'winact' {
        if (-not $script:screens) { throw 'schermi non disponibili' }
        if ([string]$req.action -eq 'focus') { $data = @{ done = [DockInput]::FocusWindow([DockScreens]::Handle([long]$req.hwnd)) } }
        else { $data = @{ done = [DockScreens]::Act([long]$req.hwnd, [string]$req.action) } }
      }
      default { throw ('comando sconosciuto: ' + $req.cmd) }
    }
    Send-Reply @{ id = $id; ok = $true; data = $data }
  } catch {
    if ($_.Exception.Message -match 'WinRT|RequestAsync') { $script:mgr = $null }
    Send-Reply @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
}
