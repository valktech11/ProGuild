import Navbar from '@/components/layout/Navbar'

export default function PrivacyPage() {
  const updated = 'April 9, 2026'
  return (
    <>
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="font-serif text-4xl text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: {updated}</p>

        {[
          { title: '1. Information we collect', content: `We collect information you provide directly when creating an account, including your name, email address, phone number, trade category, city, state, zip code, years of experience, and license number. We also collect profile photos and bio text you choose to upload. When you interact with the platform — posting content, sending messages, or contacting pros — that content is stored. We collect standard web analytics data including pages visited and features used. We do not collect payment card details directly; these are handled by our payment processor (Stripe).` },
          { title: '2. How we use your information', content: `We use your information to operate TradesNetwork, including displaying your professional profile to homeowners and other pros, facilitating lead connections, sending transactional emails (lead notifications, account updates), and improving the platform. If you are a trade professional, your name, trade, location, license number, and profile photo may be publicly visible. We do not sell your personal information to third parties. We do not use your data for advertising targeting on other platforms.` },
          { title: '3. Information from public sources', content: `For trade professionals, we may import basic information from publicly available state licensing databases (such as the Florida Department of Business and Professional Regulation) including your name, license number, trade category, city, and state. This information is public record. If you are an unclaimed pro profile imported from a state database, your placeholder profile will not display any contact information until you claim your profile and provide it yourself.` },
          { title: '4. Data sharing', content: `We share your information only as necessary to operate the platform: with Supabase (our database provider), Vercel (our hosting provider), Resend (our email delivery provider), and Stripe (our payment processor). Each of these providers processes data only as instructed by us and under their own privacy policies. We may disclose information if required by law, court order, or government authority.` },
          { title: '5. Data retention', content: `We retain your account data for as long as your account is active. If you delete your account, we will delete your personal information within 30 days, except where retention is required by law or for legitimate business purposes such as fraud prevention. Content you have posted (reviews, posts, comments) may remain on the platform in anonymised form after account deletion.` },
          { title: '6. Your rights', content: `You have the right to access, correct, or delete your personal information at any time through your account settings or by contacting us at privacy@tradesnetwork.com. You may request a copy of your data in a portable format. You may opt out of non-transactional emails at any time using the unsubscribe link in any email. If you are in the European Economic Area, you have additional rights under GDPR. If you are in California, you have additional rights under CCPA.` },
          { title: '7. Security', content: `We use industry-standard security measures including encrypted data transmission (HTTPS), encrypted database storage, and access controls. However, no method of transmission over the internet is 100% secure. We encourage you to use a strong, unique password and to contact us immediately if you suspect any unauthorised access to your account.` },
          { title: '8. Cookies', content: `We use essential cookies required for the platform to function, including session management. We do not use tracking cookies for advertising purposes. You can control cookie settings through your browser, though disabling essential cookies may affect platform functionality.` },
          { title: '9. Children', content: `TradesNetwork is not directed at children under 18. We do not knowingly collect personal information from anyone under 18. If we become aware that a minor has provided us with personal information, we will delete it promptly.` },
          { title: '10. Changes to this policy', content: `We may update this Privacy Policy from time to time. We will notify registered users of significant changes by email. Continued use of the platform after changes constitutes acceptance of the updated policy.` },
          { title: '11. Contact', content: `For privacy-related questions or requests, contact us at: privacy@tradesnetwork.com or TradesNetwork, Univaro Technologies Pvt Ltd.` },
        ].map(section => (
          <div key={section.title} className="mb-8">
            <h2 className="font-semibold text-gray-900 mb-3">{section.title}</h2>
            <p className="text-gray-600 leading-relaxed text-sm">{section.content}</p>
          </div>
        ))}
      </div>
    </>
  )
}
