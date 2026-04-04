import re

# 1. Create Label_Review.html
with open('d:/Demo/Label.html', 'r', encoding='utf-8') as f:
    label_content = f.read()

# Replace Nộp button
label_content = re.sub(
    r'<button class="btn-phe-duyet" onclick="[^"]*">Nộp</button>',
    r'<button class="btn-phe-duyet" disabled style="background-color: #E2E8F0 !important; color: #94A3B8 !important; cursor: not-allowed; box-shadow: none; pointer-events: none;">Nộp</button>',
    label_content
)

# Replace Lưu button
label_content = re.sub(
    r'<button class="btn-submit">Lưu</button>',
    r'<button class="btn-submit" disabled style="background-color: #E2E8F0 !important; color: #94A3B8 !important; cursor: not-allowed; box-shadow: none; pointer-events: none;">Lưu</button>',
    label_content
)

with open('d:/Demo/Label_Review.html', 'w', encoding='utf-8') as f:
    f.write(label_content)


# 2. Update dashboard.html
with open('d:/Demo/dashboard.html', 'r', encoding='utf-8') as f:
    dash_content = f.read()

# Add STT to the th
dash_content = dash_content.replace(
    '<th>TÊN THƯ MỤC</th>',
    '<th style="width: 48px; text-align: center;">STT</th>\n                        <th>TÊN THƯ MỤC</th>'
)

# Add <td>1</td> to Row 1
dash_content = dash_content.replace(
    '<tr>\n                        <td>\n                            <div class="folder-name">\n                                <i class="fa-regular fa-folder folder-icon"></i>\n                                nuScenes-v1.0-mini-001',
    '<tr>\n                        <td style="text-align: center; font-weight: 600; color: #64748B;">1</td>\n                        <td>\n                            <div class="folder-name">\n                                <i class="fa-regular fa-folder folder-icon"></i>\n                                nuScenes-v1.0-mini-001'
)

# Add <td>2</td> to Row 2
dash_content = dash_content.replace(
    '<tr>\n                        <td>\n                            <div class="folder-name">\n                                <i class="fa-regular fa-folder folder-icon"></i>\n                                nuScenes-v1.0-train-042',
    '<tr>\n                        <td style="text-align: center; font-weight: 600; color: #64748B;">2</td>\n                        <td>\n                            <div class="folder-name">\n                                <i class="fa-regular fa-folder folder-icon"></i>\n                                nuScenes-v1.0-train-042'
)

# Add <td>3</td> to Row 3
dash_content = dash_content.replace(
    '<tr>\n                        <td>\n                            <div class="folder-name">\n                                <i class="fa-regular fa-folder folder-icon"></i>\n                                nuScenes-v1.0-val-015',
    '<tr>\n                        <td style="text-align: center; font-weight: 600; color: #64748B;">3</td>\n                        <td>\n                            <div class="folder-name">\n                                <i class="fa-regular fa-folder folder-icon"></i>\n                                nuScenes-v1.0-val-015'
)

# Add <td>4</td> to Row 4
dash_content = dash_content.replace(
    '<tr>\n                        <td>\n                            <div class="folder-name">\n                                <i class="fa-regular fa-folder folder-icon"></i>\n                                nuScenes-v1.0-mini-002',
    '<tr>\n                        <td style="text-align: center; font-weight: 600; color: #64748B;">4</td>\n                        <td>\n                            <div class="folder-name">\n                                <i class="fa-regular fa-folder folder-icon"></i>\n                                nuScenes-v1.0-mini-002'
)

# Change "Xem lại" links to "Label_Review.html"
dash_content = dash_content.replace('<a href="Label.html" class="action-link">Xem lại</a>', '<a href="Label_Review.html" class="action-link">Xem lại</a>')

with open('d:/Demo/dashboard.html', 'w', encoding='utf-8') as f:
    f.write(dash_content)
    
print("Updated Label.html and dashboard.html successfully.")
