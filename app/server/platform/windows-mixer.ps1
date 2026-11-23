$script:mixer = $false
try {
  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class DockMixer {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyConfigCom { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, int stateMask, out IMMDeviceCollection list);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice dev);
  }
  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out int n);
    [PreserveSig] int Item(int i, out IMMDevice dev);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  }
  [StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public int pid; }
  [StructLayout(LayoutKind.Sequential)] struct PROPVARIANT { public ushort vt; ushort r1; ushort r2; ushort r3; public IntPtr p; public IntPtr p2; }
  [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out int n);
    [PreserveSig] int GetAt(int i, out PROPERTYKEY key);
    [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
  }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int N0(); int N1(); int N2(); int N3();
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int N5();
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    int N7(); int N8(); int N9(); int N10();
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int N0(); int N1();
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
  }
  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int n);
    [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s);
  }
  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    int N2(); int N3(); int N4(); int N5(); int N6(); int N7(); int N8(); int N9(); int N10();
    [PreserveSig] int GetProcessId(out uint pid);
    [PreserveSig] int IsSystemSoundsSession();
  }
  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float level, ref Guid ctx);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  [Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPolicyConfig {
    int N0(); int N1(); int N2(); int N3(); int N4(); int N5(); int N6(); int N7(); int N8(); int N9();
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
  }
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);

  static IMMDeviceEnumerator En() { return (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom()); }
  static string Clean(string s) { return (s ?? "").Replace("\t", " ").Replace("\n", " ").Replace("\r", ""); }

  static string Name(IMMDevice d) {
    IPropertyStore ps;
    if (d.OpenPropertyStore(0, out ps) != 0) return "";
    PROPERTYKEY k = new PROPERTYKEY(); k.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); k.pid = 14;
    PROPVARIANT v;
    if (ps.GetValue(ref k, out v) != 0) return "";
    string s = v.vt == 31 ? Marshal.PtrToStringUni(v.p) : "";
    PropVariantClear(ref v);
    return s ?? "";
  }
  static T Act<T>(IMMDevice d) {
    Guid iid = typeof(T).GUID; object o;
    int hr = d.Activate(ref iid, 23, IntPtr.Zero, out o);
    if (hr != 0) throw new Exception("Activate 0x" + hr.ToString("X"));
    return (T)o;
  }
  static string DefaultId(int flow) {
    IMMDevice d;
    if (En().GetDefaultAudioEndpoint(flow, 1, out d) != 0 || d == null) return "";
    string id; d.GetId(out id); return id ?? "";
  }

  public static string[] Devices() {
    var outp = new List<string>();
    for (int flow = 0; flow < 2; flow++) {
      string def = DefaultId(flow);
      IMMDeviceCollection list;
      if (En().EnumAudioEndpoints(flow, 1, out list) != 0) continue;
      int n; list.GetCount(out n);
      for (int i = 0; i < n; i++) {
        IMMDevice d; if (list.Item(i, out d) != 0) continue;
        string id; d.GetId(out id);
        float level = -1; bool mute = false;
        try { var ev = Act<IAudioEndpointVolume>(d); ev.GetMasterVolumeLevelScalar(out level); ev.GetMute(out mute); } catch { }
        outp.Add((flow == 0 ? "out" : "in") + "\t" + id + "\t" + Clean(Name(d)) + "\t" + (id == def ? "1" : "0") + "\t" +
          level.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\t" + (mute ? "1" : "0"));
      }
    }
    return outp.ToArray();
  }

  public static void SetDefault(string id) {
    var pc = (IPolicyConfig)(new PolicyConfigCom());
    for (int role = 0; role < 3; role++) {
      int hr = pc.SetDefaultEndpoint(id, role);
      if (hr != 0) throw new Exception("SetDefaultEndpoint 0x" + hr.ToString("X"));
    }
  }

  public static void SetDevice(string id, float level, int mute) {
    IMMDevice d;
    if (En().GetDevice(id, out d) != 0 || d == null) throw new Exception("dispositivo non trovato");
    var ev = Act<IAudioEndpointVolume>(d);
    Guid ctx = Guid.Empty;
    if (level >= 0) ev.SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, level)), ref ctx);
    if (mute >= 0) { bool m; ev.GetMute(out m); ev.SetMute(mute == 2 ? !m : mute == 1, ref ctx); }
  }

  static string AppName(uint pid) {
    if (pid == 0) return "Suoni di sistema";
    try {
      var p = Process.GetProcessById((int)pid);
      string desc = "";
      try { desc = p.MainModule.FileVersionInfo.FileDescription; } catch { }
      return string.IsNullOrEmpty(desc) ? p.ProcessName : desc;
    } catch { return ""; }
  }

  public static string[] Sessions() {
    var outp = new List<string>();
    var seen = new Dictionary<uint, bool>();
    IMMDeviceCollection list;
    if (En().EnumAudioEndpoints(0, 1, out list) != 0) return outp.ToArray();
    int n; list.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IMMDevice d; if (list.Item(i, out d) != 0) continue;
      string dev = Clean(Name(d));
      IAudioSessionEnumerator se;
      try { if (Act<IAudioSessionManager2>(d).GetSessionEnumerator(out se) != 0) continue; } catch { continue; }
      int c; se.GetCount(out c);
      for (int k = 0; k < c; k++) {
        IAudioSessionControl2 s; if (se.GetSession(k, out s) != 0 || s == null) continue;
        int state; s.GetState(out state);
        if (state == 2) continue;
        uint pid; s.GetProcessId(out pid);
        bool system = s.IsSystemSoundsSession() == 0;
        if (system) pid = 0;
        if (seen.ContainsKey(pid)) continue;
        string proc = "";
        if (pid != 0) { try { proc = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { continue; } }
        var v = (ISimpleAudioVolume)s;
        float level; bool mute; v.GetMasterVolume(out level); v.GetMute(out mute);
        seen[pid] = true;
        outp.Add(pid + "\t" + proc + "\t" + Clean(AppName(pid)) + "\t" + level.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\t" +
          (mute ? "1" : "0") + "\t" + (state == 1 ? "1" : "0") + "\t" + dev);
      }
    }
    return outp.ToArray();
  }

  public static int SetApp(uint pid, float level, int mute) {
    int done = 0; Guid ctx = Guid.Empty;
    IMMDeviceCollection list;
    if (En().EnumAudioEndpoints(0, 1, out list) != 0) return 0;
    int n; list.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IMMDevice d; if (list.Item(i, out d) != 0) continue;
      IAudioSessionEnumerator se;
      try { if (Act<IAudioSessionManager2>(d).GetSessionEnumerator(out se) != 0) continue; } catch { continue; }
      int c; se.GetCount(out c);
      for (int k = 0; k < c; k++) {
        IAudioSessionControl2 s; if (se.GetSession(k, out s) != 0 || s == null) continue;
        uint p; s.GetProcessId(out p);
        if (s.IsSystemSoundsSession() == 0) p = 0;
        if (p != pid) continue;
        var v = (ISimpleAudioVolume)s;
        if (level >= 0) v.SetMasterVolume(Math.Max(0f, Math.Min(1f, level)), ref ctx);
        if (mute >= 0) { bool m; v.GetMute(out m); v.SetMute(mute == 2 ? !m : mute == 1, ref ctx); }
        done++;
      }
    }
    return done;
  }
}
"@
  $script:mixer = $true
} catch { [Console]::Error.WriteLine('mixer non disponibile: ' + $_.Exception.Message) }

