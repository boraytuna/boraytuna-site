"use client";

// Contact form posting straight from the browser to Web3Forms (a hosted form service), which
// emails the message to you. A static site has no server of its own to receive form posts.
// Fields match the old builder form: Name, Your email, Message.

import { useState, type FormEvent } from "react";

const ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;

type Status = { state: "idle" | "sending" | "sent" | "error"; message?: string };

export default function ContactForm() {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!ACCESS_KEY) {
      setStatus({ state: "error", message: "The contact form isn't configured yet. Please reach out on LinkedIn or Instagram instead." });
      return;
    }
    setStatus({ state: "sending" });
    const data = new FormData(form);
    data.append("access_key", ACCESS_KEY);
    data.append("subject", "New message from boraytuna.com");
    data.append("from_name", "boraytuna.com contact form");
    try {
      const res = await fetch("https://api.web3forms.com/submit", { method: "POST", body: data });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Something went wrong.");
      form.reset();
      setStatus({ state: "sent" });
    } catch (err) {
      setStatus({ state: "error", message: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    }
  }

  const field = "mt-1 block w-full rounded-md border border-line bg-surface px-3 py-3 text-base focus:border-accent focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg bg-surface p-6 shadow-sm md:p-8">
      <div>
        <label htmlFor="name" className="font-medium">Name</label>
        <input id="name" name="name" type="text" required autoComplete="name" placeholder="Your name" className={field} />
      </div>
      <div>
        <label htmlFor="email" className="font-medium">Your email</label>
        <input id="email" name="email" type="email" required autoComplete="email" placeholder="Your email address" className={field} />
      </div>
      <div>
        <label htmlFor="message" className="font-medium">Message</label>
        <textarea id="message" name="message" required rows={6} placeholder="Enter your message" className={field} />
      </div>
      {/* Honeypot: hidden from people, bots fill it in and Web3Forms drops the submission. */}
      <input type="checkbox" name="botcheck" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button type="submit" className="button w-full sm:w-auto" disabled={status.state === "sending"}>
        {status.state === "sending" ? "Sending…" : "Submit"}
      </button>
      <p role="status" aria-live="polite" className={status.state === "error" ? "text-red-700" : "text-green-800"}>
        {status.state === "sent" && "Thank You!"}
        {status.state === "error" && status.message}
      </p>
    </form>
  );
}
