$desktop = [System.Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $desktop "He_Thong_Thi_May_Giao_Vien.lnk"
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "d:\Kiemtraqualan\KhoiDong_MayGiaoVien.bat"
$shortcut.WorkingDirectory = "d:\Kiemtraqualan"
$shortcut.Description = "Khoi dong May Chu Giao Vien - He Thong Thi Mang LAN"
$shortcut.Save()

Write-Output "SUCCESS: Created shortcut at $shortcutPath"
