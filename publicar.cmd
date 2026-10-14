@echo off
chcp 65001 >nul
rem Koru - envia o codigo e as versoes para o GitHub e publica a Release da versao mais recente com o instalador.
rem Precisa do GitHub CLI (uma vez): winget install GitHub.cli   e depois: gh auth login
cd /d "%~dp0"
del /q .git\*.lock 2>nul
del /q .git\refs\tags\*.lock 2>nul

set INST=release\Koru - Instalador.exe
for /f "delims=" %%t in ('git describe --tags --abbrev^=0') do set TAG=%%t
if "%TAG%"=="" (echo Nenhuma versao ^(tag^) encontrada. & goto fim)
echo Versao: %TAG%
echo.

echo Enviando o codigo para o GitHub...
git push origin main
if not errorlevel 1 goto tags
echo.
echo O envio normal foi recusado: o historico do GitHub esta diferente do local.
set /p R=Substituir o historico do GitHub pelo local? (s/n) 
if /i not "%R%"=="s" goto fim
git push --force-with-lease origin main
if errorlevel 1 (echo Falhou o envio do codigo. & goto fim)

:tags
echo Enviando as versoes...
git push origin --tags
if errorlevel 1 (echo Falhou o envio das versoes. & goto fim)

where gh >nul 2>nul
if errorlevel 1 goto semgh
if not exist "%INST%" (echo Instalador nao encontrado em "%INST%". & goto fim)
gh release view %TAG% -R Budart/Koru >nul 2>nul
if not errorlevel 1 goto atualiza
echo Criando a Release %TAG%...
gh release create %TAG% "%INST%" -R Budart/Koru --title "Koru %TAG%" --generate-notes --latest
if errorlevel 1 (echo Falhou criar a Release. & goto fim)
goto ok
:atualiza
echo Atualizando o instalador da Release %TAG%...
gh release upload %TAG% "%INST%" -R Budart/Koru --clobber
if errorlevel 1 (echo Falhou enviar o instalador. & goto fim)
goto ok

:semgh
echo.
echo GitHub CLI nao encontrado: o codigo foi enviado, mas a Release precisa do "gh".
echo Instale uma vez com:  winget install GitHub.cli   e entre com:  gh auth login
goto fim
:ok
echo.
echo Pronto: https://github.com/Budart/Koru/releases/tag/%TAG%
:fim
echo.
pause
