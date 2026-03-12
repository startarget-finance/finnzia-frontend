from pathlib import Path
path = Path('src/app/components/dashboard/dashboard.component.ts')
text = path.read_text(encoding='utf-8')
for term in ['carregarResumoFinanceiro', 'resumoFonteDados']:
    lines = [i for i, line in enumerate(text.splitlines(), 1) if term in line]
    print(f"{term}: {lines}")
