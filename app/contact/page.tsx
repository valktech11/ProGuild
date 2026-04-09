'use client'
import { useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'

export default function ContactPage() {
  const [type, setType]       = useState<'homeowner' | 'pro' | 'employer' | ''>('')
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit() {
    if (!name || !email || !message) { setError('Please fill in all required fields'); return }
    setSending(true); setError('')
    // Send via leads API as a contact submission
    const r = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: null,
        contact_name: name,
        contact_email: email,
        message: `[${type || 'General'}] ${subject ? subject + ': ' : ''}${message}`,
        lead_source: 'Direct',
      }),
    })
    setSending(false)
    if (r.ok) setSent(true)
    else setError('Could not send message. Please email us directly at hello@tradesnetwork.com')
  }

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <h1 className="font-serif text-4xl text-gray-900 mb-4">Get in touch</h1>
          <p className="text-lg text-gray-400 font-light">We'd love to hear from you — homeowners, pros and employers welcome.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          {[
            { type: 'homeowner', icon: '🏠', title: 'I\'m a homeowner', desc: 'Finding a pro, question about a job, or feedback about the platform' },
            { type: 'pro',       icon: '🔧', title: 'I\'m a trade pro', desc: 'Claiming my profile, subscription help, or platform support' },
            { type: 'employer',  icon: '🏗', title: 'I\'m an employer', desc: 'Hiring tradespeople, B2B partnerships, or enterprise enquiries' },
          ].map(opt => (
            <button key={opt.type} onClick={() => setType(opt.type as any)}
              className={`p-6 rounded-2xl border-2 text-left transition-all ${type === opt.type ? 'border-teal-500 bg-teal-50' : 'border-gray-100 bg-white hover:border-teal-200'}`}>
              <div className="text-3xl mb-3">{opt.icon}</div>
              <div className="font-semibold text-gray-900 mb-1">{opt.title}</div>
              <div className="text-sm text-gray-400 leading-relaxed">{opt.desc}</div>
            </button>
          ))}
        </div>

        {sent ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
            <div className="text-4xl mb-4">✓</div>
            <h2 className="font-serif text-2xl text-gray-900 mb-2">Message sent!</h2>
            <p className="text-gray-400 mb-6">We'll get back to you within 24 hours.</p>
            <Link href="/" className="text-teal-600 font-medium hover:underline">← Back to home</Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl p-8">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">Send us a message</div>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {[
                { label: 'Your name *',     value: name,    set: setName,    placeholder: 'James Harrington', type: 'text'  },
                { label: 'Email address *', value: email,   set: setEmail,   placeholder: 'james@example.com', type: 'email' },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors" />
                </div>
              ))}
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What's this about?"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors" />
            </div>
            <div className="mb-6">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Message *</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                placeholder="Tell us how we can help..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white resize-none transition-colors" />
            </div>
            <button onClick={handleSubmit} disabled={sending}
              className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {sending ? 'Sending...' : 'Send message →'}
            </button>
            <p className="text-xs text-gray-400 text-center mt-4">Or email us directly: <a href="mailto:hello@tradesnetwork.com" className="text-teal-600">hello@tradesnetwork.com</a></p>
          </div>
        )}
      </div>
    </>
  )
}
