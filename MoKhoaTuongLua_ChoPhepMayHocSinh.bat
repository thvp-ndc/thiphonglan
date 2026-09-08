@echo off
chcp 65001 >nul
:: Tu dong xin quyen Administrator neu chua co
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Dang yeu cau quyen Administrator...
    powershell -Command Start-Process '%~f0' -Verb RunAs
    exit /b
)

echo ==========================================================
echo   DANG MO KHOA TUONG LUA WINDOWS CHO PHONG THI LAN
echo ==========================================================
echo.

:: 1. Mo cong TCP 3000 va 80 cho may hoc sinh ket noi
netsh advfirewall firewall delete rule name=ThiOnline LAN (TCP 3000) >nul 2>&1
netsh advfirewall firewall add rule name=ThiOnline LAN (TCP 3000) dir=in action=allow protocol=TCP localport=3000 profile=any

netsh advfirewall firewall delete rule name=ThiOnline LAN (TCP 80) >nul 2>&1
netsh advfirewall firewall add rule name=ThiOnline LAN (TCP 80) dir=in action=allow protocol=TCP localport=80 profile=any

:: 2. Mo cong UDP 5353 (mDNS) va 5355 (LLMNR) cho ten mien thionline.local
netsh advfirewall firewall delete rule name=ThiOnline mDNS (UDP 5353) >nul 2>&1
netsh advfirewall firewall add rule name=ThiOnline mDNS (UDP 5353) dir=in action=allow protocol=UDP localport=5353 profile=any

netsh advfirewall firewall delete rule name=ThiOnline LLMNR (UDP 5355) >nul 2>&1
netsh advfirewall firewall add rule name=ThiOnline LLMNR (UDP 5355) dir=in action=allow protocol=UDP localport=5355 profile=any

netsh advfirewall firewall delete rule name=ThiOnline Beacon (UDP 41234) >nul 2>&1
netsh advfirewall firewall add rule name=ThiOnline Beacon (UDP 41234) dir=in action=allow protocol=UDP localport=41234 profile=any

echo.
echo ==========================================================
echo [THANH CONG] DA MO KHOA TUONG LUA CHO MAY CON KET NOI!
echo.
echo Cac may hoc sinh trong phong may hien da co the truy cap:
echo   1. Qua Ten mien: http://thionline.local:3000/student (hoac http://thionline.local/student)
echo   2. Qua Dia chi IP: http://192.168.1.13:3000/student
echo ==========================================================
echo.
pause
