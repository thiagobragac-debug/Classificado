@echo off
chcp 65001 >nul
echo ====================================================
echo      Enviando alteracoes para o GitHub...
echo ====================================================
echo.

:: Adiciona todos os arquivos modificados
git add .

:: Pede uma mensagem de commit, com valor padrão caso fique vazio
set /p commit_msg="Digite a mensagem do commit (ou apenas de ENTER para 'Atualizacao automatica'): "
if "%commit_msg%"=="" set commit_msg=Atualizacao automatica

:: Faz o commit com a mensagem definida
git commit -m "%commit_msg%"

:: Envia para o GitHub
echo.
echo Enviando para o repositorio remoto...
git push origin main

echo.
echo ====================================================
echo      Processo concluido!
echo ====================================================
pause
