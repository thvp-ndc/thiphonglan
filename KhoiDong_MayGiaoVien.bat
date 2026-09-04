@echo off
chcp 65001 > nul
title MAY CHU THI MANG LAN - TRUONG THCS - THPT DANG CHI THANH
color 0B

echo ==============================================================================
echo       HE THONG THI MAY TINH QUA MANG LAN - TRUONG THCS - THPT DANG CHI THANH
echo ==============================================================================
echo.

cd /d "d:\Kiemtraqualan\server"

:: 1. Kiem tra neu may chu da dang chay san tu truoc
powershell -NoProfile -Command "try { $res = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/system/info' -UseBasicParsing -TimeoutSec 1; if ($res.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [*] May chu Giao Vien DANG HOAT DONG SAN tren cong 3000!
    echo [*] Dang mo trinh duyet vao giao dien giao vien...
    start "" "http://localhost:3000/teacher"
    ping 127.0.0.1 -n 3 >nul
    exit /b 0
)

echo [*] Dang khoi dong dich vu May Chu Giao Vien...
echo [*] Tu dong do IP mang LAN va phat song UDP Beacon cho may hoc sinh...
echo.
echo ==============================================================================
echo  LUU Y QUAN TRONG:
echo  1. VUI LONG KHONG DONG CUA SO NAY TRONG SUOT QUA TRINH THI!
echo  2. Trinh duyet se tu dong mo trang Giao Vien ngay khi may chu nap xong.
echo  3. Neu can dung may chu, bam Ctrl + C hoac dong cua so nay sau gio thi.
echo ==============================================================================
echo.

:: 2. Tu dong cho may chu phan hoi 200 OK roi moi mo trinh duyet (chong ERR_CONNECTION_REFUSED)
start "" powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/teacher' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 500 }; Start-Process 'http://localhost:3000/teacher'"

:: 3. Khoi chay Node.js server
node src\index.js

echo.
echo [!] May chu da dung lai.
pause
