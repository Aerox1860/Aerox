import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Paperclip, Send, X, Image as ImageIcon, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api, formatApiError, BACKEND_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const statusStyle = {
  open: "border-yellow-500/40 text-yellow-300",
  in_progress: "border-cyan-500/40 text-cyan-300",
  resolved: "border-green-500/40 text-green-300",
  rejected: "border-red-500/40 text-red-300",
};
const statusIcon = { open: Clock, in_progress: Loader2, resolved: CheckCircle2, rejected: XCircle };

const COMMON_SUBJECTS = [
  "Deposit not credited",
  "Withdrawal delay",
  "Wrong amount deducted",
  "Login issue",
  "Other",
];

export default function Support() {
  const { user } = useAuth();
  const [subject, setSubject] = useState(COMMON_SUBJECTS[0]);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [screenshotId, setScreenshotId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const fileRef = useRef(null);

  const loadTickets = () => api.get("/support/tickets/mine").then(({ data }) => setTickets(data)).catch(() => {});
  useEffect(() => { loadTickets(); }, []);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("Max file size is 5MB");
    if (!/^image\//.test(f.type)) return toast.error("Only image files are allowed");
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const { data } = await api.post("/support/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      setScreenshotId(data.id);
      toast.success("Screenshot attached");
    } catch (err) {
      toast.error(formatApiError(err));
      setFile(null); setPreview(null); setScreenshotId(null);
    } finally { setUploading(false); }
  };

  const removeFile = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setScreenshotId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!subject || !message.trim()) return toast.error("Subject and message required");
    setSubmitting(true);
    try {
      await api.post("/support/tickets", {
        subject,
        amount: amount ? Number(amount) : null,
        message: message.trim(),
        screenshot_id: screenshotId,
      });
      toast.success("Support ticket submitted. Admin will review shortly.");
      setSubject(COMMON_SUBJECTS[0]); setAmount(""); setMessage("");
      removeFile();
      loadTickets();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSubmitting(false); }
  };

  const token = localStorage.getItem("aerox_token");

  return (
    <div className="space-y-6" data-testid="support-page">
      <div>
        <h1 className="font-heading text-2xl md:text-3xl font-black flex items-center gap-2"><LifeBuoy className="w-6 h-6 text-cyan-300" /> Support</h1>
        <p className="text-slate-400 text-sm mt-1">Facing a payment or account issue? Submit a ticket with your username, amount, and a payment screenshot. Admin usually responds within a few hours.</p>
      </div>

      <form onSubmit={submit} className="card-surface p-5 space-y-4" data-testid="support-form">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Username</label>
            <input value={user?.name || ""} disabled className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none text-slate-400" data-testid="support-username-input" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Amount (₹) — optional</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 font-mono"
              placeholder="e.g. 500" data-testid="support-amount-input" />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-400">Subject</label>
          <select value={subject} onChange={(e) => setSubject(e.target.value)}
            className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500"
            data-testid="support-subject-select">
            {COMMON_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-400">Describe the issue</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} required
            className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500"
            placeholder="Explain what happened, and include your UTR / txn ID if applicable."
            data-testid="support-message-input" />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-400">Payment screenshot (optional, max 5MB)</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" data-testid="support-file-input" />
          {!file ? (
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-1 w-full btn-ghost py-3 rounded-lg flex items-center justify-center gap-2" data-testid="support-attach-btn">
              <Paperclip className="w-4 h-4" /> Attach screenshot
            </button>
          ) : (
            <div className="mt-1 relative card-raised p-2 flex items-center gap-3" data-testid="support-file-preview">
              {preview && <img src={preview} alt="preview" className="w-16 h-16 rounded object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{file.name}</div>
                <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB {uploading && "• uploading..."}</div>
                {uploading && <div className="flex items-center gap-1 text-xs text-cyan-300 mt-0.5"><Loader2 className="w-3 h-3 animate-spin" /> Uploading to server...</div>}
                {screenshotId && !uploading && <div className="flex items-center gap-1 text-xs text-green-400 mt-0.5"><CheckCircle2 className="w-3 h-3" /> Attached</div>}
              </div>
              <button type="button" onClick={removeFile} className="btn-ghost p-2 rounded" data-testid="support-remove-file-btn"><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        <button type="submit" disabled={submitting || uploading} className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2" data-testid="support-submit-btn">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Send className="w-4 h-4" /> Submit ticket</>}
        </button>
      </form>

      <div className="card-surface p-5">
        <h2 className="font-heading font-bold mb-3">My tickets</h2>
        <div className="divide-y divide-white/5" data-testid="my-tickets-list">
          {tickets.length === 0 && <div className="text-sm text-slate-500 py-2">No support tickets yet.</div>}
          {tickets.map((t) => {
            const Icon = statusIcon[t.status] || Clock;
            return (
              <div key={t.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.subject}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{new Date(t.created_at).toLocaleString()} {t.amount != null && <>• ₹{t.amount}</>}</div>
                    <div className="text-sm text-slate-300 mt-1.5 break-words">{t.message}</div>
                    {t.screenshot_id && (
                      <a href={`${BACKEND_URL}/api/support/files/${t.screenshot_id}?auth=${token}`} target="_blank" rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                        <ImageIcon className="w-3 h-3" /> View screenshot
                      </a>
                    )}
                    {t.admin_reply && (
                      <div className="mt-2 card-raised p-2.5">
                        <div className="text-[10px] uppercase tracking-widest text-cyan-300">Admin reply</div>
                        <div className="text-sm mt-0.5">{t.admin_reply}</div>
                      </div>
                    )}
                  </div>
                  <div className={`chip ${statusStyle[t.status]}`}>
                    <Icon className="w-3 h-3" /> {t.status.replace("_", " ")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
