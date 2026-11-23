Add-Type -Namespace Dock -Name Monitor -MemberDefinition @'
[DllImport("user32.dll")]
public static extern bool PostMessage(System.IntPtr hWnd, uint msg, System.IntPtr wParam, System.IntPtr lParam);
'@
Start-Sleep -Milliseconds 300
[void][Dock.Monitor]::PostMessage([System.IntPtr]0xffff, 0x0112, [System.IntPtr]0xF170, [System.IntPtr]2)
