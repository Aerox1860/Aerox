import { X } from "lucide-react";

export const TERMS_TEXT = `AeroX Crash — Terms of Use & House Rules

1. Age requirement
   You must be 18 years of age or older to create an account or place any bet on AeroX Crash.
   Providing false age information will result in permanent account termination and forfeiture
   of any balance.

2. Account
   You are responsible for keeping your credentials safe. One account per person. Sharing
   accounts, using multiple accounts, or automated betting bots is prohibited.

3. Fair play
   Every round uses a provably-fair server-seed + client-seed hashing algorithm. The
   server-seed hash is published before the round starts and revealed after it crashes so
   you can independently verify every result.

4. Deposits
   All deposits are made manually via UPI to admin's published UPI IDs. You must submit a
   valid, unique UTR (transaction reference). Duplicate UTRs are auto-rejected. Admin
   approves and credits within a few hours.

5. Withdrawals
   Minimum withdrawal is ₹100. Withdrawals are paid manually by admin to the UPI/bank
   account you submit. Requested amount is locked from your balance until paid or rejected.

6. Bonuses
   Signup bonus, daily bonus and referral bonus are promotional credits. GoWin365 may revoke
   bonuses if abuse is detected.

7. Prohibited conduct
   Fraud, chargebacks, offensive chat, harassment of other players or admin will result in
   immediate account block and forfeiture of balance.

8. Liability
   GoWin365 is a game of chance. Play responsibly. Never bet more than you can afford
   to lose. GoWin365 is not responsible for any financial loss.

9. Changes
   These terms may be updated at any time. Continued use of the platform after changes
   are posted constitutes acceptance of the updated terms.

By clicking "I agree" you confirm you are 18+ and accept these terms in full.`;

export const PRIVACY_TEXT = `GoWin365 — Privacy Policy

Data we collect
   • Email address, name, referral code, IP address at signup.
   • Payment details you voluntarily provide (UPI ID, UTR, bank details) for the sole purpose
     of processing manual deposits and withdrawals.
   • Bet, chat and gameplay history for account statements and support investigations.

How we use it
   • To operate your account, process deposits and withdrawals, and calculate winnings.
   • To respond to your support tickets and moderate chat.
   • To detect abuse, fraud or bot activity.

How we protect it
   • Passwords are stored using industry-standard bcrypt hashing — never in plain text.
   • Payment details are stored only for the duration required to process the transaction
     and are visible only to admin.
   • Screenshots you upload to support tickets are stored in encrypted object storage and
     accessible only by you and admin.

What we DON'T do
   • We do not sell your data to any third party.
   • We do not send you unsolicited marketing emails.
   • We do not share account balance or bet history with any party outside of admin
     (unless required by law).

Your rights
   • You may request deletion of your account at any time by contacting support. Note that
     residual transaction records may be retained for anti-fraud purposes.

Contact
   For any privacy question, email support at the address shown on the Contact page.`;

export function LegalModal({ title, text, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose} data-testid="legal-modal">
      <div className="card-surface w-full max-w-2xl max-h-[85vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="font-heading text-lg font-bold" data-testid="legal-modal-title">{title}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" data-testid="legal-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto whitespace-pre-wrap text-sm text-slate-300 leading-relaxed" data-testid="legal-modal-body">
          {text}
        </div>
        <div className="p-4 border-t border-white/5 flex justify-end">
          <button onClick={onClose} className="btn-primary px-5 py-2 rounded-lg text-sm" data-testid="legal-modal-ok">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
