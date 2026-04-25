import Navbar from '@/components/layout/Navbar'
import Link from 'next/link'

export default function TermsPage() {
  const updated = 'April 9, 2026'
  return (
    <>
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="font-serif text-4xl text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: {updated}</p>

        {[
          { title: '1. Acceptance of terms', content: 'By accessing or using ProGuild.ai ("the platform"), you agree to be bound by these Terms of Service. If you do not agree, do not use the platform. These terms apply to all users including homeowners, trade professionals, and employers.' },
          { title: '2. Description of service', content: 'ProGuild.ai is a professional platform connecting licensed trade professionals with homeowners and employers. We provide tools for professional profiles, lead connections, community engagement, and portfolio management. We are not a party to any agreement between homeowners and trade professionals — we facilitate connections only.' },
          { title: '3. User accounts', content: 'You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account and password. You may not share your account with others. You must be at least 18 years old to use the platform. You may not create accounts for others without their explicit consent.' },
          { title: '4. Trade professional accounts', content: 'Trade professionals represent that all information provided, including license numbers, trade categories, and years of experience, is accurate and truthful. Providing false licensing information is grounds for immediate account termination. Your license status may be verified against public state licensing databases. ProGuild.ai reserves the right to display publicly available licensing information on your profile.' },
          { title: '5. Zero per-lead fee commitment', content: 'ProGuild.ai commits to never charging trade professionals a per-lead fee. Subscription plans provide unlimited access to leads. This commitment applies to the core platform; future premium features may be priced separately. This commitment does not apply to third-party integrations.' },
          { title: '6. User content', content: 'You retain ownership of content you post (posts, photos, reviews, portfolio items). By posting content, you grant ProGuild.ai a non-exclusive, worldwide, royalty-free license to display, reproduce, and distribute that content on the platform. You are responsible for ensuring your content does not infringe third-party rights, contain false information, violate applicable laws, or include harmful, defamatory, or obscene material. We reserve the right to remove content that violates these terms.' },
          { title: '7. Reviews and ratings', content: 'Reviews must be based on genuine first-hand experience. Fake, incentivised, or malicious reviews are prohibited. We reserve the right to remove reviews that violate this policy. Pros may not solicit or pay for reviews. Homeowners may not post reviews for work that was not completed.' },
          { title: '8. Prohibited conduct', content: 'You may not: use the platform to spam, harass, or harm other users; attempt to circumvent any platform security measure; scrape or harvest data from the platform; impersonate any person or entity; use the platform for any unlawful purpose; interfere with the operation of the platform; or attempt to access accounts belonging to others.' },
          { title: '9. Subscriptions and payments', content: 'Paid subscriptions are billed monthly or annually as selected. Subscriptions auto-renew until cancelled. Cancellations take effect at the end of the current billing period. Refunds are available within 7 days of initial purchase for annual plans. We reserve the right to modify subscription pricing with 30 days notice to existing subscribers.' },
          { title: '10. Disclaimers', content: 'ProGuild.ai provides the platform "as is" without warranties of any kind. We do not warrant that trade professionals are licensed, insured, or qualified for any specific job. Homeowners are responsible for verifying credentials before hiring. We are not responsible for the quality of work performed by trade professionals found through the platform.' },
          { title: '11. Limitation of liability', content: 'To the maximum extent permitted by law, ProGuild.ai shall not be liable for any indirect, incidental, special, consequential or punitive damages, including loss of profits, data, or goodwill, arising from your use of the platform. Our total liability shall not exceed the amount you paid to us in the 12 months preceding the claim.' },
          { title: '12. Termination', content: 'We reserve the right to suspend or terminate your account at any time for violations of these terms. You may delete your account at any time through your account settings. Upon termination, your right to use the platform ceases immediately.' },
          { title: '13. Governing law', content: 'These terms are governed by the laws of the State of Florida, United States. Any disputes shall be resolved in the courts of Florida, and you consent to personal jurisdiction in those courts.' },
          { title: '14. Contact', content: 'For questions about these terms, contact us at: legal@proguild.com' },
        ].map(section => (
          <div key={section.title} className="mb-8">
            <h2 className="font-semibold text-gray-900 mb-3">{section.title}</h2>
            <p className="text-gray-600 leading-relaxed text-sm">{section.content}</p>
          </div>
        ))}

        <div className="border-t border-gray-100 pt-6 mt-8">
          <p className="text-sm text-gray-400">Related: <Link href="/privacy" className="text-teal-600 hover:underline">Privacy Policy</Link></p>
        </div>
      </div>
    </>
  )
}
