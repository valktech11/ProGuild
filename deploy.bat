@echo off
SET PROJECT=C:\Raju\VALK\tradesnetwork-next
SET DOWNLOADS=%USERPROFILE%\Downloads
SET ZIPNAME=%~1
SET MSG=%~2

IF "%ZIPNAME%"=="" (
  echo ERROR: Provide zip filename
  echo Usage: deploy.bat v44-patch.zip "commit message"
  exit /b 1
)
IF "%MSG%"=="" SET MSG=patch update

SET DOWNLOADS_ZIP=%DOWNLOADS%\%ZIPNAME%
SET PROJECT_ZIP=%PROJECT%\%ZIPNAME%

REM Move zip from Downloads to project
IF EXIST "%DOWNLOADS_ZIP%" (
  echo [1/5] Moving %ZIPNAME% from Downloads...
  move "%DOWNLOADS_ZIP%" "%PROJECT_ZIP%"
  IF ERRORLEVEL 1 ( echo Move failed. & exit /b 1 )
) ELSE IF EXIST "%PROJECT_ZIP%" (
  echo [1/5] Found %ZIPNAME% in project folder.
) ELSE (
  echo ERROR: %ZIPNAME% not found in Downloads or project folder.
  exit /b 1
)

REM Extract
SET TEMP_DIR=%TEMP%\proguild_%RANDOM%
echo [2/5] Extracting...
powershell -Command "Expand-Archive -Path '%PROJECT_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"
IF ERRORLEVEL 1 ( echo Extraction failed. & exit /b 1 )

FOR /D %%D IN ("%TEMP_DIR%\*") DO SET PATCH_DIR=%%D

REM Preview
echo [3/5] Files that will be copied:
robocopy "%PATCH_DIR%" "%PROJECT%" /E /IS /IT /L /NJH /NJS

SET /P CONFIRM=Copy and deploy? (Y/N): 
IF /I NOT "%CONFIRM%"=="Y" (
  echo Cancelled.
  rmdir /S /Q "%TEMP_DIR%"
  exit /b 0
)

REM Copy
echo [4/5] Copying...
robocopy "%PATCH_DIR%" "%PROJECT%" /E /IS /IT /NJH /NJS
rmdir /S /Q "%TEMP_DIR%"
del "%PROJECT_ZIP%"

REM Git
echo [5/5] Git...
cd /d "%PROJECT%"
REM Reduce Windows file-lock conflicts on .git/objects
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
IF ERRORLEVEL 1 (
  echo Push failed - if prompted "Should I try again" type Y and press Enter each time.
  echo Re-trying push...
  git push origin main
)
echo Done.
