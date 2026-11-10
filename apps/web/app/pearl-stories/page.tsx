import { redirect } from 'next/navigation';
import { VERSIONS } from '@/components/pearl-story/versions';

// Pearl Stories opens on the first story; the others are its tabs.
export default function PearlStories() {
  redirect(`/pearl-stories/${VERSIONS[0].slug}`);
}
