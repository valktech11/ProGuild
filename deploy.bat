@echo off
SET PROJECT=C:\Raju\VALK\tradesnetwork-next
SET DOWNLOADS=%USERPROFILE%\Downloads
SET ZIPNAME=%~1
SET MSG=%~2

IF "%ZIPNAME%"=="" (
  echo ERROR: Provide zip filename
  echo Usage: deploy.bat v54-patch.zip "commit message"
  exit /b 1
)
IF "%MSG%"=="" SET MSG=patch update

SET DOWNLOADS_ZIP=%DOWNLOADS%\%ZIPNAME%

REM Locate zip — only look in Downloads, never copy into project folder
IF NOT EXIST "%DOWNLOADS_ZIP%" (
  echo ERROR: %ZIPNAME% not found in Downloads folder.
  echo Place the zip in %DOWNLOADS% and try again.
  exit /b 1
)
echo [1/5] Found %ZIPNAME% in Downloads.

REM Extract to temp — never touch the project folder during extraction
SET TEMP_DIR=%TEMP%\proguild_%RANDOM%
echo [2/5] Extracting to temp...
powershell -Command "Expand-Archive -Path '%DOWNLOADS_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"
IF ERRORLEVEL 1 ( echo Extraction failed. & exit /b 1 )

REM Find the inner folder the zip extracted into
FOR /D %%D IN ("%TEMP_DIR%\*") DO SET PATCH_DIR=%%D

REM Preview what will be copied
echo [3/5] Files that will be copied:
robocopy "%PATCH_DIR%" "%PROJECT%" /E /IS /IT /L /NJH /NJS

SET /P CONFIRM=Copy and deploy? (Y/N): 
IF /I NOT "%CONFIRM%"=="Y" (
  echo Cancelled.
  rmdir /S /Q "%TEMP_DIR%"
  exit /b 0
)

REM Copy files into project — zip stays untouched in Downloads
echo [4/5] Copying files...
robocopy "%PATCH_DIR%" "%PROJECT%" /E /IS /IT /NJH /NJS
rmdir /S /Q "%TEMP_DIR%"
echo Zip kept at: %DOWNLOADS_ZIP%

REM Git — set fscache config once to reduce Windows file-lock issues
echo [5/5] Git...
cd /d "%PROJECT%"
git config core.fscache true
git config core.preloadindex true
git config gc.auto 256
git status
SET /P GITCONFIRM=Commit and push? (Y/N): 
IF /I NOT "%GITCONFIRM%"=="Y" (
  echo Files copied. Push skipped.
  exit /b 0
)
git add -A
git commit -m "%MSG%"
git push origin main
echo Done.
