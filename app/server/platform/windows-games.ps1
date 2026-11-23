param(
  [string]$Action = '',
  [string]$File = '',
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

function Write-Json($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)) }

function Get-LinkTarget([string]$p) {
  if ($p -notmatch '\.lnk$') { return '' }
  $sh = New-Object -ComObject WScript.Shell
  return [string]$sh.CreateShortcut($p).TargetPath
}

try {
  if ($Action -eq 'pick') {
    Add-Type -AssemblyName System.Windows.Forms
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0
    $owner.StartPosition = 'CenterScreen'
    $owner.Show(); $owner.Activate()
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title = 'Scegli il gioco (eseguibile o collegamento)'
    $dlg.Filter = 'Giochi (*.exe;*.lnk;*.url;*.bat)|*.exe;*.lnk;*.url;*.bat|Tutti i file (*.*)|*.*'
    $dlg.DereferenceLinks = $false
    $dlg.CheckFileExists = $true
    $res = $dlg.ShowDialog($owner)
    $owner.Close()
    if ($res -eq [System.Windows.Forms.DialogResult]::OK) { Write-Json @{ path = $dlg.FileName } } else { Write-Json @{ path = '' } }
    exit 0
  }

  if ($Action -eq 'info') {
    $target = Get-LinkTarget $File
    $exe = if ($target) { $target } else { $File }
    $label = ''
    if ($exe -match '\.exe$' -and (Test-Path -LiteralPath $exe)) {
      $vi = (Get-Item -LiteralPath $exe).VersionInfo
      foreach ($c in @($vi.ProductName, $vi.FileDescription)) {
        if ($c -and $c.Trim() -and $c.Trim() -notmatch '^(launcher|game|application|client)$') { $label = $c.Trim(); break }
      }
    }
    if (-not $label) { $label = [IO.Path]::GetFileNameWithoutExtension($File) }
    $process = if ($exe -match '\.exe$') { [IO.Path]::GetFileNameWithoutExtension($exe).ToLower() } else { '' }
    Write-Json @{ label = $label; target = $target; process = $process }
    exit 0
  }

  if ($Action -eq 'icon') {
    Add-Type -AssemblyName System.Drawing
    $src = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class GameIcon {
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr phbm); }
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx; public int cy; }
  [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public short bmPlanes, bmBitsPixel; public IntPtr bmBits; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int size, out BITMAP bm);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  public static Bitmap Get(string path, int size) {
    IShellItemImageFactory f;
    SHCreateItemFromParsingName(path, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out f);
    IntPtr hbm;
    int hr = f.GetImage(new SIZE { cx = size, cy = size }, 4, out hbm);
    if (hr != 0) throw new Exception("GetImage " + hr);
    try {
      BITMAP bm; GetObject(hbm, Marshal.SizeOf(typeof(BITMAP)), out bm);
      if (bm.bmBitsPixel != 32 || bm.bmBits == IntPtr.Zero) return Image.FromHbitmap(hbm);
      var tmp = new Bitmap(bm.bmWidth, bm.bmHeight, bm.bmWidthBytes, PixelFormat.Format32bppArgb, bm.bmBits);
      var outBmp = new Bitmap(tmp);
      outBmp.RotateFlip(RotateFlipType.RotateNoneFlipY);
      tmp.Dispose();
      return outBmp;
    } finally { DeleteObject(hbm); }
  }
}
'@
    Add-Type -TypeDefinition $src -ReferencedAssemblies System.Drawing
    $target = Get-LinkTarget $File
    $p = if ($target -and (Test-Path -LiteralPath $target)) { $target } else { $File }
    try {
      $bmp = [GameIcon]::Get($p, 256)
    } catch {
      $bmp = ([System.Drawing.Icon]::ExtractAssociatedIcon($p)).ToBitmap()
    }
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Json @{ ok = $true }
    exit 0
  }

  Write-Json @{ error = 'azione sconosciuta' }
  exit 2
} catch {
  Write-Json @{ error = $_.Exception.Message }
  exit 1
}
