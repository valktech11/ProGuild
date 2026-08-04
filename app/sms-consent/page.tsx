import Navbar from '@/components/layout/Navbar'

export default function SmsConsentPage() {
  return (
    <>
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="font-serif text-4xl text-gray-900 mb-2">SMS Consent & Messaging Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: August 4, 2026</p>

        <div className="mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">How You Opt In</h2>
          <p className="text-gray-600 leading-relaxed text-sm">
            When you contact a contractor through ProGuild.ai — whether by submitting a quote request,
            scheduling a service visit, or providing your phone number to a licensed contractor who uses
            the ProGuild.ai platform — you consent to receive transactional SMS text messages from that
            contractor via ProGuild.ai. These messages relate directly to your project or service request.
          </p>
        </div>

        <div className="mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">What Messages You Will Receive</h2>
          <p className="text-gray-600 leading-relaxed text-sm">
            You may receive SMS messages including: appointment confirmations, inspection scheduling,
            project status updates, estimate notifications, invoice reminders, and job completion notices.
            All messages are transactional and directly related to the service you requested.
            Message frequency varies depending on the status of your project.
          </p>
        </div>

        <div className="mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">Sample Opt-In Language</h2>
          <p className="text-gray-600 leading-relaxed text-sm mb-3">
            When a homeowner provides their phone number to a contractor using the ProGuild.ai platform,
            the contractor records this as consent to receive project-related SMS updates. The homeowner
            is informed of the following at the point of contact:
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed">
            <p><strong>Consent statement:</strong> "By providing your phone number, you agree to receive
            transactional SMS messages from [Contractor Name] via ProGuild.ai regarding your project,
            including appointment confirmations, status updates, and invoice reminders. Message frequency
            varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help."</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">How to Opt Out</h2>
          <p className="text-gray-600 leading-relaxed text-sm">
            You can opt out at any time by replying <strong>STOP</strong> to any message you receive.
            You will immediately receive a confirmation that you have been unsubscribed and will receive
            no further messages. To re-subscribe, reply <strong>START</strong>.
          </p>
        </div>

        <div className="mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">How to Get Help</h2>
          <p className="text-gray-600 leading-relaxed text-sm">
            Reply <strong>HELP</strong> to any message for assistance.
            Message and data rates may apply.
            You may also contact us at <a href="mailto:privacy@proguild.ai" className="text-blue-600 underline">privacy@proguild.ai</a>.
          </p>
        </div>

        <div className="mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">Data Privacy</h2>
          <p className="text-gray-600 leading-relaxed text-sm">
            Mobile phone numbers collected through SMS communications are not shared with third parties
            or affiliates for marketing or promotional purposes. Your number is used solely to send
            project-related updates on behalf of the contractor you engaged.
            See our full <a href="/privacy" className="text-blue-600 underline">Privacy Policy</a> and{' '}
            <a href="/terms" className="text-blue-600 underline">Terms of Service</a>.
          </p>
        </div>

        <div className="mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">Contact</h2>
          <p className="text-gray-600 leading-relaxed text-sm">
            ProGuild LLC · <a href="mailto:privacy@proguild.ai" className="text-blue-600 underline">privacy@proguild.ai</a> · proguild.ai
          </p>
        </div>
      </div>
    </>
  )
}
