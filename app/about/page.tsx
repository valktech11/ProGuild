import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-14">

        {/* Hero */}
        <div className="text-center mb-16">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-teal-600 bg-teal-50 px-3 py-1 rounded-full mb-5">Our story</span>
          <h1 className="font-serif text-5xl text-gray-900 mb-6 leading-tight">
            The professional home for<br />America's trades workforce
          </h1>
          <p className="text-xl text-gray-400 font-light leading-relaxed max-w-2xl mx-auto">
            We built ProGuild.ai because the trades industry deserved better than a lead-generation service that treats skilled professionals like commodities.
          </p>
        </div>

        {/* The problem */}
        <div className="bg-white border border-gray-100 rounded-2xl p-10 mb-8">
          <h2 className="font-serif text-2xl text-gray-900 mb-4">The problem we're solving</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            A master electrician with 20 years of experience, a spotless license record, and dozens of satisfied customers has no professional home on the internet. LinkedIn is for office workers. Facebook is personal. Every other platform either treats them as an Uber driver — charging per lead — or ignores them entirely.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Meanwhile, homeowners have no reliable way to verify whether the person they're hiring is actually licensed, insured, and trustworthy. Star ratings can be faked. Claims go unverified. The result is a market built on uncertainty — for everyone.
          </p>
        </div>

        {/* What we built */}
        <div className="bg-white border border-gray-100 rounded-2xl p-10 mb-8">
          <h2 className="font-serif text-2xl text-gray-900 mb-6">What we built</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: '✓', title: 'Verified professional identity', desc: 'Every pro\'s license is cross-referenced with official state licensing databases. No unverified claims.' },
              { icon: '📊', title: 'TradeScore', desc: 'A composite credibility score combining license status, experience, reviews, peer endorsements and more.' },
              { icon: '🌐', title: 'Professional community', desc: 'A LinkedIn-style network where trade professionals share work, connect with peers, and build their reputation.' },
              { icon: '💰', title: 'Zero per-lead fees — forever', desc: 'We will never charge pros per lead. A flat subscription means unlimited connections, no gambling on leads.' },
              { icon: '🤝', title: 'Pro-to-pro referrals', desc: 'When a plumber refers a homeowner to an electrician, both benefit. The network grows by serving its members.' },
              { icon: '🎓', title: 'Apprentice pipeline', desc: 'Connecting the next generation of tradespeople with experienced masters who can train them.' },
            ].map(item => (
              <div key={item.title} className="flex gap-4">
                <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">{item.icon}</div>
                <div>
                  <div className="font-semibold text-gray-900 mb-1">{item.title}</div>
                  <div className="text-sm text-gray-500 leading-relaxed">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Our promise */}
        <div className="bg-teal-600 rounded-2xl p-10 mb-8 text-white">
          <h2 className="font-serif text-2xl mb-4">Our promise to trade professionals</h2>
          <p className="text-teal-100 leading-relaxed mb-6">
            ProGuild.ai will never sell your leads to competitors, charge you per enquiry, or treat you as inventory. Your professional profile, your reputation, and your connections belong to you.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              'Zero per-lead fees. Ever.',
              'Your data stays yours.',
              'No hidden charges.',
            ].map(p => (
              <div key={p} className="flex items-center gap-2 text-sm font-medium">
                <span className="text-teal-300">✓</span> {p}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="font-serif text-2xl text-gray-900 mb-4">Ready to join?</h2>
          <p className="text-gray-400 mb-8">Join thousands of verified trade professionals building their career on ProGuild.ai.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/login?tab=signup" className="px-8 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors">
              Join as a pro →
            </Link>
            <Link href="/" className="px-8 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
              Find a pro
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
