@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
echo ====================================================
echo      Enviando alteracoes para o GitHub...
echo ====================================================
echo.

:: Adiciona todos os arquivos modificados
git add .

:: Limpa a variavel antes de usar
set "commit_msg="

:: Pede uma mensagem de commit
set /p "commit_msg=Digite a mensagem do commit (ou apenas de ENTER para 'Atualizacao automatica'): "

:: Define padrao se estiver vazio
if not defined commit_msg set "commit_msg=Atualizacao automatica"

:: Faz o commit com a mensagem definida
git commit -m "!commit_msg!"

:: Envia para o GitHub
echo.
echo Enviando para o repositorio remoto...
git push origin main

echo.
echo ====================================================
echo      Processo concluido!
echo ====================================================
pause
endlocal
