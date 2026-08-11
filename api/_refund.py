"""Logic hoàn tiền khách hàng — lưu case trên Upstash Redis (REST)."""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

import requests

TZ_VN = timezone(timedelta(hours=7))

# Env từ Vercel Integration (prefix REFUND_)
KV_URL = (os.environ.get("REFUND_KV_REST_API_URL") or os.environ.get("KV_REST_API_URL") or "").rstrip("/")
KV_TOKEN = (
    os.environ.get("REFUND_KV_REST_API_TOKEN")
    or os.environ.get("KV_REST_API_TOKEN")
    or ""
)

STATUS_LABELS = {
    "NEW": "Mới",
    "PREPARING": "Đang xử lý",
    "ACB_PENDING_APPROVAL": "Chờ duyệt ACB",
    "ACB_PAYMENT_PENDING": "Chờ duyệt / Chờ tiền",
    "PAYMENT_CONFIRMED": "Đã ghi nhận tiền ra",
    "NEED_PHASE_2": "Cần tiếp tục",
    "INVOICE_PENDING_SIGNATURE": "Chờ ký HĐ",
    "INVOICE_ISSUED": "Đã phát hành HĐ",
    "REFUND_PENDING": "Đang hoàn tiền",
    "DONE": "Hoàn tất",
    "ERROR": "Có lỗi",
}

# Nhóm status cho badge dashboard
DASHBOARD_GROUPS = {
    "NEED_PHASE_2": ["NEED_PHASE_2", "PAYMENT_CONFIRMED"],
    "ACB_PAYMENT_PENDING": ["ACB_PAYMENT_PENDING", "ACB_PENDING_APPROVAL"],
    "PREPARING": ["NEW", "PREPARING"],
    "DONE": ["DONE"],
}


def _now_iso() -> str:
    return datetime.now(TZ_VN).isoformat(timespec="seconds")


def _kv_available() -> bool:
    return bool(KV_URL and KV_TOKEN)


def _kv_cmd(*args: Any) -> Any:
    """Gọi 1 lệnh Redis qua Upstash REST. args[0] = command name."""
    if not _kv_available():
        raise RuntimeError(
            "Chưa cấu hình Upstash Redis. Cần REFUND_KV_REST_API_URL và REFUND_KV_REST_API_TOKEN."
        )
    headers = {
        "Authorization": f"Bearer {KV_TOKEN}",
        "Content-Type": "application/json",
    }
    # Upstash REST: POST body = JSON array ["SET", "key", "value", ...]
    resp = requests.post(KV_URL, headers=headers, json=list(args), timeout=15)
    if resp.status_code >= 400:
        raise RuntimeError(f"Redis lỗi {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"Redis error: {data['error']}")
    return data.get("result") if isinstance(data, dict) else data


def _case_key(case_id: str) -> str:
    return f"refund:case:{case_id}"


def _order_key(order_code: str) -> str:
    return f"refund:order:{(order_code or '').strip().upper()}"


def _status_key(status: str) -> str:
    return f"refund:index:status:{status}"


def _load_case(case_id: str) -> dict | None:
    raw = _kv_cmd("GET", _case_key(case_id))
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return json.loads(raw)


def _save_case(case: dict) -> None:
    case_id = case["id"]
    case["updated_at"] = _now_iso()
    _kv_cmd("SET", _case_key(case_id), json.dumps(case, ensure_ascii=False))


def _append_timeline(case: dict, action: str, note: str = "", by: str = "user") -> None:
    case.setdefault("timeline", []).append(
        {
            "at": _now_iso(),
            "action": action,
            "by": by,
            "note": note or "",
        }
    )


def create_case(payload: dict) -> dict:
    """Tạo hồ sơ hoàn tiền mới."""
    order_code = (payload.get("order_code") or "").strip().upper()
    customer_name = (payload.get("customer_name") or "").strip()
    course_name = (payload.get("course_name") or "").strip()
    receive_account = (payload.get("receive_account") or "").strip()
    receive_bank = (payload.get("receive_bank") or "").strip()
    source_account = (payload.get("source_account") or "").strip()
    refund_amount = payload.get("refund_amount")
    transfer_content = (payload.get("transfer_content") or "").strip()
    note = (payload.get("note") or "").strip()

    if not order_code:
        return {"error": "Thiếu mã đơn hàng"}
    if not customer_name:
        return {"error": "Thiếu tên khách hàng"}
    if not receive_account:
        return {"error": "Thiếu số tài khoản nhận"}
    if not receive_bank:
        return {"error": "Thiếu ngân hàng nhận"}

    # Không cho tạo trùng mã đơn đang mở (chưa DONE)
    existing_id = _kv_cmd("GET", _order_key(order_code))
    if existing_id:
        existing = _load_case(str(existing_id))
        if existing and existing.get("status") != "DONE":
            return {
                "error": f"Đã có hồ sơ đang mở cho {order_code} (status: {existing.get('status')})",
                "existing_id": existing.get("id"),
            }

    try:
        amount = int(refund_amount) if refund_amount not in (None, "") else 0
    except (TypeError, ValueError):
        amount = 0

    if not transfer_content and order_code:
        course_short = course_name or ""
        transfer_content = f"HOAN TIEN {order_code}" + (f" - {course_short}" if course_short else "")

    case_id = str(uuid.uuid4())
    now = _now_iso()
    case = {
        "id": case_id,
        "order_code": order_code,
        "customer_name": customer_name,
        "course_name": course_name,
        "refund_amount": amount,
        "receive_account": receive_account,
        "receive_bank": receive_bank,
        "source_account": source_account,
        "transfer_content": transfer_content,
        "status": "NEW",
        "timeline": [
            {
                "at": now,
                "action": "created",
                "by": "user",
                "note": note or "Tạo hồ sơ",
            }
        ],
        "documents": [],
        "sepay_match": None,
        "created_at": now,
        "updated_at": now,
    }

    _save_case(case)
    # Index
    _kv_cmd("LPUSH", "refund:index:all", case_id)
    _kv_cmd("SADD", _status_key("NEW"), case_id)
    _kv_cmd("SET", _order_key(order_code), case_id)

    return {"ok": True, "case": case}


def list_cases(limit: int = 100, status_filter: str = "") -> dict:
    """Lấy danh sách case + đếm theo nhóm dashboard."""
    ids = _kv_cmd("LRANGE", "refund:index:all", 0, max(0, limit - 1)) or []
    if isinstance(ids, str):
        ids = [ids]

    cases: list[dict] = []
    counts = {
        "NEED_PHASE_2": 0,
        "ACB_PAYMENT_PENDING": 0,
        "PREPARING": 0,
        "DONE": 0,
        "ERROR": 0,
        "total": 0,
    }

    status_filter = (status_filter or "").strip().upper()

    for cid in ids:
        case = _load_case(str(cid))
        if not case:
            continue
        st = (case.get("status") or "").upper()
        counts["total"] += 1
        if st in ("NEED_PHASE_2", "PAYMENT_CONFIRMED"):
            counts["NEED_PHASE_2"] += 1
        elif st in ("ACB_PAYMENT_PENDING", "ACB_PENDING_APPROVAL"):
            counts["ACB_PAYMENT_PENDING"] += 1
        elif st in ("NEW", "PREPARING"):
            counts["PREPARING"] += 1
        elif st == "DONE":
            counts["DONE"] += 1
        elif st == "ERROR":
            counts["ERROR"] += 1

        if status_filter:
            # Cho phép filter theo nhóm dashboard
            group = DASHBOARD_GROUPS.get(status_filter)
            if group:
                if st not in group:
                    continue
            elif st != status_filter:
                continue

        cases.append(
            {
                "id": case["id"],
                "order_code": case.get("order_code"),
                "customer_name": case.get("customer_name"),
                "course_name": case.get("course_name"),
                "refund_amount": case.get("refund_amount") or 0,
                "status": st,
                "status_label": STATUS_LABELS.get(st, st),
                "updated_at": case.get("updated_at"),
                "created_at": case.get("created_at"),
            }
        )

    return {"ok": True, "cases": cases, "counts": counts}


def get_case(case_id: str) -> dict:
    case_id = (case_id or "").strip()
    if not case_id:
        return {"error": "Thiếu case_id"}
    case = _load_case(case_id)
    if not case:
        return {"error": "Không tìm thấy hồ sơ"}
    case["status_label"] = STATUS_LABELS.get(case.get("status", ""), case.get("status"))
    return {"ok": True, "case": case}


def update_case_status(case_id: str, new_status: str, note: str = "") -> dict:
    case_id = (case_id or "").strip()
    new_status = (new_status or "").strip().upper()
    if not case_id or not new_status:
        return {"error": "Thiếu case_id hoặc status"}
    if new_status not in STATUS_LABELS:
        return {"error": f"Status không hợp lệ: {new_status}"}

    case = _load_case(case_id)
    if not case:
        return {"error": "Không tìm thấy hồ sơ"}

    old = case.get("status")
    if old == new_status:
        return {"ok": True, "case": case, "unchanged": True}

    # Cập nhật index status
    if old:
        _kv_cmd("SREM", _status_key(old), case_id)
    _kv_cmd("SADD", _status_key(new_status), case_id)

    case["status"] = new_status
    _append_timeline(
        case,
        "status_change",
        note or f"{STATUS_LABELS.get(old, old)} → {STATUS_LABELS.get(new_status, new_status)}",
    )
    _save_case(case)
    case["status_label"] = STATUS_LABELS.get(new_status, new_status)
    return {"ok": True, "case": case}


def parse_email_text(text: str) -> dict:
    """Parser đơn giản nội dung email → các field form."""
    text = text or ""
    result = {
        "order_code": "",
        "customer_name": "",
        "course_name": "",
        "receive_account": "",
        "receive_bank": "",
        "refund_amount": None,
    }

    # Mã đơn
    m = re.search(r"(?:mã\s*đơn|ma\s*don|order|đơn\s*hàng)[:\s#]*([A-Z]{2,}\d{3,})", text, re.I)
    if not m:
        m = re.search(r"\b(DH\d{4,}|BIZ\d{4,}|SA\d{4,})\b", text, re.I)
    if m:
        result["order_code"] = m.group(1).upper()

    # STK
    m = re.search(r"(?:stk|số\s*tài\s*khoản|so\s*tai\s*khoan|account)[:\s]*([0-9]{6,20})", text, re.I)
    if m:
        result["receive_account"] = m.group(1)

    # Ngân hàng phổ biến
    banks = ["ACB", "Vietcombank", "VCB", "Techcombank", "TCB", "MB", "MBBank", "VPBank", "TPBank", "BIDV", "Vietinbank", "Sacombank", "MSB"]
    for b in banks:
        if re.search(rf"\b{re.escape(b)}\b", text, re.I):
            result["receive_bank"] = b.upper() if len(b) <= 4 else b
            break

    # Số tiền
    m = re.search(r"(?:số\s*tiền|so\s*tien|amount|hoàn)[:\s]*([0-9][0-9\.,]*)\s*(?:đ|d|vnd|vnđ)?", text, re.I)
    if m:
        raw = m.group(1).replace(".", "").replace(",", "")
        try:
            result["refund_amount"] = int(raw)
        except ValueError:
            pass

    # Tên khách — heuristic
    m = re.search(r"(?:khách\s*hàng|khach\s*hang|customer|họ\s*tên|ho\s*ten)[:\s]+([^\n\r,;]{3,60})", text, re.I)
    if m:
        result["customer_name"] = m.group(1).strip()

    # Khóa học
    m = re.search(r"(?:khóa\s*học|khoa\s*hoc|course)[:\s]+([^\n\r,;]{2,80})", text, re.I)
    if m:
        result["course_name"] = m.group(1).strip()

    return {"ok": True, "fields": result}
