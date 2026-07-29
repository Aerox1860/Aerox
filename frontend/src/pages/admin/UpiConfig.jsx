import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

export default function AdminUpi() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ label: "", upi_id: "", qr_url: "", active: true });

  const load = () => api.get("/admin/upi").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.label || !form.upi_id) return toast.error("Label and UPI ID required");
    try {
      await api.post("/admin/upi", form);
      toast.success("UPI added");
      setForm({ label: "", upi_id: "", qr_url: "", active: true });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const update = async (u) => {
    try { await api.patch(`/admin/upi/${u.id}`, { label: u.label, upi_id: u.upi_id, qr_url: u.qr_url, active: u.active }); toast.success("Updated"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this UPI?")) return;
    await api.delete(`/admin/upi/${id}`); toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-5" data-testid="admin-upi">
      <div>
        <h1 className="font-heading text-3xl font-black">UPI & QR Setup</h1>
        <p className="text-slate-400 text-sm mt-1">Multiple UPI options users can pick from during deposit.</p>
      </div>

      <form onSubmit={create} className="card-surface p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label (e.g. Primary UPI)"
            className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500" data-testid="upi-label-input" />
          <input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="UPI ID (name@bank)"
            className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 font-mono" data-testid="upi-id-input" />
          <input value={form.qr_url} onChange={(e) => setForm({ ...form, qr_url: e.target.value })} placeholder="QR image URL (optional)"
            className="sm:col-span-2 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 text-sm" data-testid="upi-qr-input" />
        </div>
        <button type="submit" className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2" data-testid="upi-create-btn"><Plus className="w-4 h-4" /> Add UPI</button>
      </form>

      <div className="grid md:grid-cols-2 gap-4" data-testid="upi-list">
        {items.length === 0 && <div className="text-sm text-slate-500">No UPI added yet.</div>}
        {items.map((u) => (
          <div key={u.id} className="card-surface p-4 space-y-3">
            <input value={u.label} onChange={(e) => setItems((arr) => arr.map((x) => x.id === u.id ? { ...x, label: e.target.value } : x))}
              className="w-full bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-cyan-500" />
            <input value={u.upi_id} onChange={(e) => setItems((arr) => arr.map((x) => x.id === u.id ? { ...x, upi_id: e.target.value } : x))}
              className="w-full bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-cyan-500 font-mono" />
            <input value={u.qr_url || ""} onChange={(e) => setItems((arr) => arr.map((x) => x.id === u.id ? { ...x, qr_url: e.target.value } : x))}
              placeholder="QR URL" className="w-full bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-cyan-500 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={u.active} onChange={(e) => setItems((arr) => arr.map((x) => x.id === u.id ? { ...x, active: e.target.checked } : x))} /> Active
            </label>
            <div className="flex justify-between">
              <button onClick={() => update(u)} className="btn-primary px-3 py-1.5 rounded text-xs flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
              <button onClick={() => del(u.id)} className="btn-danger px-3 py-1.5 rounded text-xs flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
