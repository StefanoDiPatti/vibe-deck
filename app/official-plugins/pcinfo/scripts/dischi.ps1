$disks = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Sort-Object DeviceID | ForEach-Object {
  $used = $_.Size - $_.FreeSpace
  [pscustomobject]@{
    name    = $_.DeviceID
    label   = $_.VolumeName
    usedGb  = [math]::Round($used / 1GB, 1)
    freeGb  = [math]::Round($_.FreeSpace / 1GB, 1)
    totalGb = [math]::Round($_.Size / 1GB, 1)
    pct     = if ($_.Size) { [math]::Round(100 * $used / $_.Size) } else { 0 }
  }
}
ConvertTo-Json -InputObject @($disks) -Compress