@echo off
chcp 65001 > nul
title MỞ CỔNG TƯỜNG LỬA CHO PHÒNG MÁY LAN

echo Đang yêu cầu quyền Administrator để mở cổng tường lửa...
:: Check for admin rights and auto-elevate
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Vui lòng bấm "Yes" trong cửa sổ UAC hiện ra để cấp quyền Administrator...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

echo =====================================================================
echo  ĐANG THÊM QUY TẮC TƯỜNG LỬA CHO HỆ THỐNG THI MẠNG LAN
echo =====================================================================
echo.

echo [1/2] Đang mở cổng TCP 3000 (Giao diện Web & WebSocket)...
netsh advfirewall firewall delete rule name="LAN Exam Web (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="LAN Exam Web (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any

echo [2/2] Đang mở cổng UDP 41234 (Tự động dò tìm máy chủ UDP Beacon)...
netsh advfirewall firewall delete rule name="LAN Exam UDP Discovery (Port 41234)" >nul 2>&1
netsh advfirewall firewall add rule name="LAN Exam UDP Discovery (Port 41234)" dir=in action=allow protocol=UDP localport=41234 profile=any

echo.
echo =====================================================================
echo  HOÀN TẤT! CÁC MÁY CON TRONG PHÒNG MÁY GIỜ ĐÃ CÓ THỂ KẾT NỐI TỰ DO.
echo =====================================================================
echo.
pause
