import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { t, type Locale } from '@/lib/i18n';

const githubUrl =
  process.env.NEXT_PUBLIC_GITHUB_URL?.trim() || 'https://github.com/DanielTrindade';
const linkedinUrl = process.env.NEXT_PUBLIC_LINKEDIN_URL?.trim();
const resumeUrl = process.env.NEXT_PUBLIC_RESUME_URL?.trim();

export function ProfileActions({ locale }: { locale: Locale }) {
  return (
    <nav className="profile-actions" aria-label={t(locale, 'profile.actionsLabel')}>
      <HStack gap={2} wrap="wrap">
        <Button
          href={githubUrl}
          target="_blank"
          rel="noreferrer"
          label={t(locale, 'profile.github')}
          variant="secondary"
          size="sm"
        />
        {linkedinUrl && (
          <Button
            href={linkedinUrl}
            target="_blank"
            rel="noreferrer"
            label={t(locale, 'profile.linkedin')}
            variant="ghost"
            size="sm"
          />
        )}
        {resumeUrl && (
          <Button
            href={resumeUrl}
            target="_blank"
            rel="noreferrer"
            label={t(locale, 'profile.resume')}
            variant="ghost"
            size="sm"
          />
        )}
      </HStack>
    </nav>
  );
}
