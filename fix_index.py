import sys

file_path = r'c:\classificado\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = lines[:527]
new_lines.append('    "logo": {\n')
new_lines.append('      "@type": "ImageObject",\n')
new_lines.append('      "url": "https://tauzeclass.com.br/assets/logo.png"\n')
new_lines.append('    }\n')
new_lines.append('  }\n')
new_lines.append('}\n')
new_lines.append('</script>\n')
new_lines.append('</body>\n')
new_lines.append('</html>\n')

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Fixed index.html!")
