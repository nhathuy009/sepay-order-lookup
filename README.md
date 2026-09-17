Công cụ tra cứu đơn hàng (10X + SOLOBIZ) — Web app trên Vercel

Web app nội bộ: tra cứu đơn hàng (DH… / BIZ… / SA…), chuyển khoản SePay, hóa đơn điện tử, HĐĐT Tổng cục Thuế, bảng lương, Air Packing List, eHoadon, hoàn tiền…

Backend là serverless function Python trên Vercel.

Cấu trúc

api/
  index.py                 Serverless entrypoint chính — phân nhánh theo body.action
  telegram.py              Webhook bot Telegram
  hlsproxy.py              Proxy HLS / resolve m3u8 (dùng cho trang player)
  _core.py                 Tra cứu đơn 10X / SOLOBIZ (login, cache token in-memory)
  _payment.py              SePay: giao dịch, sao kê, danh sách TKNH
  _invoice.py              Hóa đơn điện tử SePay (ASP.NET WebForms)
  _gdt_invoice.py          HĐĐT Tổng cục Thuế (danh sách / chi tiết / export XML)
  _invoiceBKAV.py          eHoadon (BKAV) — login, tạo HĐ, danh sách
  _customsdeclaration.py   Parse tờ khai hải quan từ file
  _refund.py               Hoàn tiền (Upstash Redis) — hiện đang tạm tắt trong index.py

index.html + app.js + app.css   Giao diện chính (các tab chức năng)
vercel.json                     Build + route (Python @vercel/python@4.8.0 + static)
requirements.txt                requests, openpyxl, beautifulsoup4, xlrd
.env.example                    Danh sách biến môi trường

# Các trang phụ (static)
jotun.html                      Trộn màu sơn (Mixbox)           → /jotun
123av.html + 123avupdate-new.js 123AV Player / plugin           → /123av
indexplayer.html                Film4K-style HLS player         → /4k
excel_auditor_quy_trinh.html    Excel Auditor quy trình         → /quytrinh
C12_TS_editable.html            C12 editable                    → /c12
ebook.html                      Bộ Ebook Thuế & Kế toán         → /ebook



Ghi chú: dùng @vercel/python@4.8.0 (mô hình multi-file cũ) vì runtime Python mới (6.x) bắt buộc 1 entrypoint và dễ làm hỏng việc phục vụ trang tĩnh khi ghim runtime kiểu zero-config.

Các tab chức năng chính (index.html)







Tab



Action backend



Env cần





Tra cứu hàng loạt



lookup, excel



LOGIN_EMAIL, LOGIN_PASSWORD





Tra cứu CK (SePay)



search_transaction, list_transactions, get_bank_accounts, bank_statement



SEPAY_API_TOKEN





Tra cứu hóa đơn



invoice, invoice_by_date



EINVOICE_*





Tra cứu HĐĐT (GDT)



gdt_invoice_by_type, gdt_invoice_detail, gdt_invoice_export_xml



(user nhập MST/MK trên UI)





Xử lý bảng lương



fetch_employees_excel



—





Xuất Air Packing List



(xử lý client + parse_customs_declaration)



—





Tạo hóa đơn eHoadon



ehoadon_login, ehoadon_buyer_search, ehoadon_invoice_create, ehoadon_invoice_list



(user nhập trên UI; tùy chọn ehoadon_username / ehoadon_password prefill)





Hoàn tiền



refund_*



Đang tạm tắt — cần Upstash KV khi bật lại

Deploy lên Vercel





Đẩy repo này lên GitHub.



Vào https://vercel.com → Add New… → Project → chọn repo.



Framework Preset để Other (đã có vercel.json).



Mở Settings → Environment Variables, thêm các biến trong .env.example (ít nhất nhóm BẮT BUỘC).



Deploy. URL dạng https://<project>.vercel.app.



Sau khi thêm/đổi Environment Variables phải Redeploy để có hiệu lực.

Biến môi trường tóm tắt

Bắt buộc (tra cứu đơn):





LOGIN_EMAIL, LOGIN_PASSWORD — tài khoản 10X / SOLOBIZ



APP_ACCESS_TOKEN — mật khẩu bảo vệ web app (khuyến nghị)

Theo chức năng:





EINVOICE_BASE_URL, EINVOICE_USERNAME, EINVOICE_PASSWORD, EINVOICE_SERIAL — tab hóa đơn SePay



SEPAY_API_TOKEN — tab SePay / sao kê



ehoadon_username, ehoadon_password — prefill form eHoadon (tùy chọn)



TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ALLOWED_IDS — bot Telegram



REFUND_KV_REST_API_URL + REFUND_KV_REST_API_TOKEN (hoặc KV_REST_API_*) — khi bật lại refund

Xem chi tiết + ví dụ trong file .env.example.

Bot Telegram

Endpoint: POST /api/telegram (api/telegram.py).

Gửi mã đơn (DH… / BIZ…) → nhận kết quả. Nhiều mã: mỗi mã một dòng.

Set webhook (chạy 1 lần, thay TOKEN, SECRET và URL project của bạn):

curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<project>.vercel.app/api/telegram","secret_token":"<SECRET>","allowed_updates":["message","edited_message"]}'

Tải XML hóa đơn (tab HĐĐT / GDT)

Sau khi tra cứu danh sách từ hoadondientu.gdt.gov.vn:





Nút XML trên từng dòng / trong popup chi tiết → tải invoice.xml gốc (chữ ký số người bán + CQT).



Tick nhiều dòng → Tải XML đã chọn: 1 HĐ = file .xml; nhiều HĐ = 1 file .zip.

Action: gdt_invoice_export_xml (body: username, password, invoice, token tùy chọn).

Trạng thái chức năng Hoàn tiền

Import _refund trong api/index.py đang bị comment vì lệch version (thiếu một số hàm so với expect của index.py). Mọi action refund_* trả về HTTP 503:



Chức năng hoàn tiền (refund) đang tạm thời bảo trì.

Khi đồng bộ xong _refund.py, bỏ comment khối import và các nhánh refund_* trong index.py rồi cấu hình Upstash Redis (REFUND_KV_REST_API_*).

Bảo mật





App có URL công khai → nên đặt APP_ACCESS_TOKEN. Để trống = ai có link cũng tra cứu được.



Không hardcode email/mật khẩu trong code — luôn dùng Environment Variables.



Khuyến nghị đổi mật khẩu hệ thống 10X/SOLOBIZ và eInvoice nếu từng lộ trong chat/script cũ.



Credentials GDT / eHoadon do user nhập trên UI, không lưu server (trừ prefill eHoadon từ env).

Chạy thử local

# Tạo .env từ mẫu
cp .env.example .env
# Điền LOGIN_EMAIL, LOGIN_PASSWORD, ...

npm i -g vercel
vercel dev

Hoặc chỉ test logic Python:

pip install -r requirements.txt
LOGIN_EMAIL=... LOGIN_PASSWORD=... python -c "from api._core import lookup_order; print(lookup_order('DH18700'))"

