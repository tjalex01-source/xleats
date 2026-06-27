'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Post = { id: string; body: string; created_at: string };

export default function Posts() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState('');

  async function load() {
    const { data } = await supabase.from('posts')
      .select('id,body,created_at').eq('truck_id', truckId).order('created_at', { ascending: false });
    setPosts((data as Post[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  async function post() {
    if (!body.trim()) return;
    await supabase.from('posts').insert({ truck_id: truckId, body });
    setBody(''); load();
    // TODO(phase1): fan out push to followers on new post.
  }

  return (
    <div>
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Posts</h1>
      <p className="text-sm text-muted">Updates your followers see — specials, sell-outs, location changes.</p>

      <div className="mt-5 rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
          placeholder="What’s happening at the truck today?"
          className="w-full resize-none rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand" />
        <button onClick={post} disabled={!body.trim()}
          className="mt-2 rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60">
          Post update
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {posts.map((p) => (
          <div key={p.id} className="rounded-ticket border border-edge bg-white p-4">
            <p className="whitespace-pre-wrap">{p.body}</p>
            <p className="mt-1 text-xs text-muted">{new Date(p.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
