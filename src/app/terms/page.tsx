import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of service · Infinite canvas",
  description: "The terms for using Infinite canvas.",
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of service">
      <p className="leading-7">
        These terms cover use of Infinite canvas at canvas.highleverage.com, operated by High Leverage. The{" "}
        <a className="underline" href="/privacy">
          privacy policy
        </a>{" "}
        describes how account data and boards are handled.
      </p>

      <LegalSection title="Who can use it">
        <p className="leading-7">
          This is a private app. You need a Google account, and an admin has to allow your email. If that email is
          removed, access stops.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p className="leading-7">
          You keep ownership of the images and text you put on your boards. You give High Leverage permission to store
          that content and show it back to you so the app can work. That permission ends when the content is deleted.
        </p>
        <p className="leading-7">
          You are responsible for having the rights to what you upload. Do not upload anything illegal, or anything
          that violates someone else's rights.
        </p>
      </LegalSection>

      <LegalSection title="Your boards">
        <p className="leading-7">
          Boards are private to the account that created them. The service is not promised to be available all the
          time, and stored files are not promised to be free of loss. Keep your own copies of anything you cannot
          replace.
        </p>
      </LegalSection>

      <LegalSection title="Stopping use">
        <p className="leading-7">
          You can sign out at any time. An admin can remove your email. Access can be suspended if these terms are
          broken.
        </p>
      </LegalSection>

      <LegalSection title="As is">
        <p className="leading-7">
          The app is provided as is. To the extent the law allows, High Leverage is not liable for lost content, lost
          access, or other damages from use of the app.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p className="leading-7">
          If these terms change, the date at the top of this page will change. Continuing to use the app after that
          means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p className="leading-7">
          Questions about these terms go through the{" "}
          <a className="underline" href="https://www.highleverage.com/contact" rel="noreferrer">
            High Leverage contact form
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
