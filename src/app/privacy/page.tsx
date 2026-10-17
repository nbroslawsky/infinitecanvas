import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy policy · Infinite canvas",
  description: "How Infinite canvas uses your Google account and the boards you create.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy policy">
      <p className="leading-7">
        Infinite canvas at canvas.highleverage.com is a private place to arrange images, labels, and frames. High
        Leverage operates it. This policy describes what the app collects and how that information is used.
      </p>

      <LegalSection title="Google account data">
        <p className="leading-7">
          Sign-in uses Google. The app requests your name, email address, and profile picture. It does not request
          Gmail, Drive, Calendar, Contacts, or any other Google product.
        </p>
        <p className="leading-7">That information is used only to:</p>
        <ul className="list-disc space-y-1 pl-5 leading-7">
          <li>confirm it is you</li>
          <li>decide whether your email is allowed to use the app</li>
          <li>show your name and picture in the header</li>
        </ul>
        <p className="leading-7">
          Google also issues sign-in tokens. Those tokens are stored so your session can continue. They are not used to
          read anything else in your Google account.
        </p>
        <p className="leading-7">
          Google user data is not sold, not used for advertising, and not used to train models. It is not shared except
          with the companies that host this app, and only so the app can run.
        </p>
      </LegalSection>

      <LegalSection title="What else we store">
        <ul className="list-disc space-y-1 pl-5 leading-7">
          <li>Boards you create: names, layout, text, colors, and positions</li>
          <li>Images you upload, including PNG, JPEG, WebP, GIF, SVG, and HEIC</li>
          <li>Email addresses an admin adds on the People page, and which admin added them</li>
          <li>Session details: a sign-in token, when it expires, your IP address, and your browser</li>
        </ul>
        <p className="leading-7">
          Boards and images are private to the account that created them. Another signed-in person cannot open them,
          including an admin.
        </p>
      </LegalSection>

      <LegalSection title="Who handles it">
        <p className="leading-7">
          The app is hosted on Vercel. The database is Neon. Uploaded files are stored with Vercel Blob. Google handles
          sign-in. These providers process the data only to provide that infrastructure.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p className="leading-7">Account, boards, and images are kept while you use the app.</p>
        <p className="leading-7">
          Removing an email on the People page blocks the next sign-in. It does not delete that person's boards or
          images.
        </p>
        <p className="leading-7">
          You can delete a board yourself. To delete an account and the files that belong to it, use the{" "}
          <a className="underline" href="https://www.highleverage.com/contact" rel="noreferrer">
            High Leverage contact form
          </a>{" "}
          and include the Google email on the account. High Leverage will delete the account, its boards, and its
          uploaded images.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p className="leading-7">
          This app is not for children under 13, and it does not knowingly collect their information.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p className="leading-7">If this policy changes, the date at the top of this page will change.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p className="leading-7">
          Questions about this policy go through the{" "}
          <a className="underline" href="https://www.highleverage.com/contact" rel="noreferrer">
            High Leverage contact form
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
