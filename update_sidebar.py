import re
import os

def update_file(filepath, css_block, html_block):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace CSS: from /* Sidebar Styling */ to either /* Main Wrapper */ or /* Main Content */
    # Be careful not to replace beyond the first match.
    content = re.sub(
        r'/\*\s*Sidebar Styling\s*\*/.*?(?=\n\s*/\*\s*Main *(Wrapper|Content)\s*\*/)', 
        css_block, 
        content, 
        flags=re.DOTALL
    )

    # Replace HTML
    content = re.sub(
        r'<!-- Sidebar -->\s*<aside class="sidebar" id="sidebar">.*?</aside>', 
        '<!-- Sidebar -->\n    ' + html_block, 
        content, 
        flags=re.DOTALL
    )

    # Make sure active states are correct for the current page
    if 'ManagerUser.html' in filepath:
        content = content.replace('href="dashboard.html" class="nav-item active"', 'href="dashboard.html" class="nav-item"')
        content = content.replace('href="ManagerUser.html" class="nav-item"', 'href="ManagerUser.html" class="nav-item active"')
    elif 'Test.html' in filepath:
        content = content.replace('href="dashboard.html" class="nav-item active"', 'href="dashboard.html" class="nav-item"')
        content = content.replace('href="Test.html" class="nav-item"', 'href="Test.html" class="nav-item active"')
    elif 'setting.html' in filepath:
        content = content.replace('href="dashboard.html" class="nav-item active"', 'href="dashboard.html" class="nav-item"')
        content = content.replace('href="setting.html" class="nav-item"', 'href="setting.html" class="nav-item active"')

    # Replace 'Kiểm thử chéo' with 'Kiểm thử dữ liệu'
    content = content.replace('Kiểm thử chéo', 'Kiểm thử dữ liệu')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# First process dashboard.html and extract the blocks
with open('d:/Demo/dashboard.html', 'r', encoding='utf-8') as f:
    db = f.read()

css_match = re.search(r'(/\*\s*Sidebar Styling\s*\*/.*?)(?=\n\s*/\*\s*Main *(Wrapper|Content)\s*\*/)', db, re.DOTALL)
html_match = re.search(r'(<aside class="sidebar" id="sidebar">.*?</aside>)', db, re.DOTALL)

if css_match and html_match:
    css_block = css_match.group(1).rstrip()
    html_block = html_match.group(1)
    
    update_file('d:/Demo/ManagerUser.html', css_block, html_block)
    update_file('d:/Demo/Test.html', css_block, html_block)
    update_file('d:/Demo/setting.html', css_block, html_block)
    
    # Also update dashboard.html to replace "Kiểm thử chéo"
    db = db.replace('Kiểm thử chéo', 'Kiểm thử dữ liệu')
    with open('d:/Demo/dashboard.html', 'w', encoding='utf-8') as f:
        f.write(db)
        
    print("Updated all files successfully.")
else:
    print("Failed to extract from dashboard.html")
    if not css_match: print("CSS match failed")
    if not html_match: print("HTML match failed")
