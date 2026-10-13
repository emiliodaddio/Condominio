@echo off
echo ==============================================
echo   Avvio Servizio MySQL Server (Gestione Condominiale)
echo ==============================================
tasklist /FI "IMAGENAME eq mysqld.exe" 2>NUL | find /I /N "mysqld.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [INFO] MySQL Server e gia in esecuzione.
) else (
    echo [INFO] Avvio di mysqld.exe in background...
    start "" "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --datadir="%USERPROFILE%\mysql_data" --port=3306
    echo [OK] MySQL Server avviato sulla porta 3306!
)
pause
