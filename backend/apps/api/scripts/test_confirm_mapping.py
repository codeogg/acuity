"""测试确认映射完整流程。"""
import httpx

PORTS = [8002]


def test_port(port: int) -> None:
    print(f"\n=== port {port} ===")
    c = httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=8)
    login = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    print("login", login.status_code)
    if login.status_code != 200:
        return
    c.cookies.set("access_token", login.json()["access_token"])
    templates = c.get("/api/admin/templates").json()
    if not templates:
        print("no templates")
        return
    tid = templates[0]["id"] if isinstance(templates, list) else templates["items"][0]["id"]
    fields = c.get(f"/api/admin/templates/{tid}/fields").json()
    f = next((x for x in fields if not x["is_confirmed"]), None)
    if not f:
        print("all confirmed")
        return
    std = c.get("/api/admin/standard-fields").json()[0]
    fid = f["id"]
    m = c.post(
        f"/api/admin/templates/{tid}/fields/{fid}/mapping",
        json={
            "standard_field_id": std["id"],
            "fixed_value": None,
            "checkbox_map_value": None,
            "confirm": True,
        },
    )
    print("mapping+confirm POST", m.status_code, m.text[:120] if m.status_code != 200 else "OK")
    if m.status_code != 200:
        return
    fresh = next(x for x in c.get(f"/api/admin/templates/{tid}/fields").json() if x["id"] == fid)
    print("is_confirmed", fresh.get("is_confirmed"))


if __name__ == "__main__":
    for p in PORTS:
        try:
            test_port(p)
        except Exception as exc:
            print(f"port {p} error:", exc)
