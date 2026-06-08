import base64
import zlib
import urllib.request

mermaid_code = """flowchart TB
    %% Định nghĩa Style nâng cao (Màu Pastel & Viền đậm)
    classDef client fill:#e0f2fe,stroke:#0284c7,stroke-width:3px,color:#0f172a,rx:12,ry:12
    classDef comm fill:#f1f5f9,stroke:#94a3b8,stroke-width:2px,stroke-dasharray: 5 5,color:#0f172a,rx:8,ry:8
    classDef server fill:#dcfce7,stroke:#16a34a,stroke-width:3px,color:#0f172a,rx:12,ry:12
    classDef admin fill:#fce7f3,stroke:#db2777,stroke-width:3px,color:#0f172a,rx:12,ry:12
    classDef db fill:#ffedd5,stroke:#ea580c,stroke-width:3px,color:#0f172a
    
    subgraph TopRow [" "]
        direction LR
        Client["🖥️ <b>WORKSPACE CLIENT</b><br><i>(Gán nhãn viên & Reviewer)</i><hr>• Khung nhìn đơn 6 camera<br>• Canvas 2D vẽ & duyệt nhãn<br>• Caching ảnh tốc độ cao"]:::client
        
        Comm["🌐 <b>GIAO TIẾP</b><hr>REST API (JSON)"]:::comm
        
        Server["⚙️ <b>SERVER NULABEL</b><br><i>(Backend FastAPI)</i><hr>• Tiếp nhận & Xác thực<br>• 🧠 AI YOLOv8 quét nháp<br>• Lọc Active Learning<br>• Đo lường IoU/Precision"]:::server
        
        Client ==>|Gửi & Duyệt nhãn| Comm
        Comm ==>|Payload| Server
    end

    subgraph BottomRow [" "]
        direction RL
        DB[("🗄️ <b>DATABASE</b><br><i>(SQL Server)</i><hr>• Tọa độ hộp nhãn<br>• Lịch sử & Điểm số<br>• Quản lý Task/User<br>• Dữ liệu ảnh nuScenes")]:::db
        
        Admin["📊 <b>ADMIN DASHBOARD</b><br><i>(Admin & Reviewer)</i><hr>• Giám sát TAT & Tiến độ<br>• Chấm điểm User Precision<br>• Đối sánh AI vs Con người<br>• Phê duyệt / Xuất bản"]:::admin
        
        Admin ==>|Lưu trữ / Truy xuất| DB
    end

    Server ==>|Đồng bộ trạng thái| Admin
    Admin -.->|Phân công Task & Cấu hình bộ lọc AI| Client
    
    style TopRow fill:none,stroke:none
    style BottomRow fill:none,stroke:none
"""

# Compress with zlib, compress level 9
compressed = zlib.compress(mermaid_code.encode('utf-8'), 9)
# Base64 encode, url-safe
b64 = base64.urlsafe_b64encode(compressed).decode('utf-8')

url = f"https://kroki.io/mermaid/png/{b64}?scale=3" # Add scale=3 for high resolution

try:
    # Adding a User-Agent header since sometimes public APIs block plain urllib requests
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response, open("d:/NuLabel/DATN/nulabel_architecture_diagram.png", 'wb') as out_file:
        out_file.write(response.read())
    print("Success! High-resolution image saved to d:/NuLabel/DATN/nulabel_architecture_diagram.png")
except Exception as e:
    print("Error:", e)
