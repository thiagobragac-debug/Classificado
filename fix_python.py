import sys
import re

with open('c:\\classificado\\painel.html', 'rb') as f:
    content = f.read()

try:
    # Try to decode as utf-8
    text = content.decode('utf-8')
    
    # If it has mojibake, replace it explicitly
    text = text.replace('AnÃºncios', 'Anúncios')
    text = text.replace('anÃºncios', 'anúncios')
    text = text.replace('AnÃºncio', 'Anúncio')
    text = text.replace('anÃºncio', 'anúncio')
    text = text.replace('GrÃ¡tis', 'Grátis')
    text = text.replace('AlteraÃ§Ãµes', 'Alterações')
    text = text.replace('ApresentaÃ§Ã£o', 'Apresentação')
    text = text.replace('PaÃs', 'País')
    text = text.replace('ProvÃncia', 'Província')
    text = text.replace('vocÃª', 'você')
    text = text.replace('InÃcio', 'Início')
    text = text.replace('MÃ¡quinas', 'Máquinas')
    text = text.replace('mÃ¡quinas', 'máquinas')
    text = text.replace('LeilÃµes', 'Leilões')
    text = text.replace('NÃ£o', 'Não')
    text = text.replace('nÃ£o', 'não')
    text = text.replace('PortuguÃªs', 'Português')
    text = text.replace('EspaÃ±ol', 'Español')
    text = text.replace('tÃtulo', 'título')
    text = text.replace('InformaÃ§Ãµes', 'Informações')
    text = text.replace('AtÃ©', 'Até')
    text = text.replace('PaÃ­s', 'País')
    text = text.replace('ProvÃ­ncia', 'Província')
    text = text.replace('tÃ­tulo', 'título')
    text = text.replace('InÃ­cio', 'Início')
    text = text.replace('MÃ¡quinas', 'Máquinas')
    
    # Let's also decode the strange characters
    # If we read the text and it has "ǧ", we can't easily guess.
    # But let's just write back the fixed text.
    
    with open('c:\\classificado\\painel.html', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Fixed via python explicitly")
except Exception as e:
    print("Error:", e)
