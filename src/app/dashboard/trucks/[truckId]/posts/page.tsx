'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Post = { id: string; body: string; image_url: string | null; created_at: string };

export default function Posts() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  async function load() {
    const { data } = await supabase.from('posts')
      .select('id,body,image_url,created_at').eq('truck_id', truckId).order('created_at', { ascending: false });
    setPosts((data as Post[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  function resetForm() {
    setBody(''); setPhotoFile(null); setEditingId(null);
  }

  function startEdit(p: Post) {
    setBody(p.body);
    setPhotoFile(null);
    setEditingId(p.id);
  }

  async function save() {
    if (!body.trim()) return;
    setPosting(true);
    let imageUrl: string | null | undefined;
    if (photoFile) {
      const path = `${truckId}/${crypto.randomUUID()}-${photoFile.name}`;
      const { error } = await supabase.storage.from('posts').upload(path, photoFile);
      if (!error) imageUrl = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
    }
    if (editingId) {
      const patch: { body: string; image_url?: string } = { body };
      if (imageUrl) patch.image_url = imageUrl;
      await supabase.from('posts').update(patch).eq('id', editingId);
    } else {
      await supabase.from('posts').insert({ truck_id: truckId, body, image_url: imageUrl ?? null });
    }
    setPosting(false); resetForm(); load();
    // TODO(phase1): fan out push to followers on new post — needs the customer app's
    // device push tokens to exist first (later phase), not buildable yet.
  }

  async function removePost(id: string) {
    await supabase.from('posts').delete().eq('id', id);
    if (editingId === id) resetForm();
    load();
  }

  return (
    <div>
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Posts</h1>
      <p className="text-sm text-muted">
        Post updates for your followers — sell-outs, location changes, anything happening today.
      </p>

      <div className="mt-5 rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
          placeholder="What’s happening at the truck today?"
          className="w-full resize-none rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand" />
        <div className="mt-2">
          <label className="mb-1 block text-xs font-semibold text-muted">
            {editingId ? 'Replace photo (optional)' : 'Photo (optional)'}
          </label>
          <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </div>
        <div className="mt-3 flex gap-3">
          <button onClick={save} disabled={!body.trim() || posting}
            className="rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60">
            {posting ? 'Saving…' : editingId ? 'Save changes' : 'Post update'}
          </button>
          {editingId && <button onClick={resetForm} className="text-sm text-muted">Cancel</button>}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {posts.map((p) => (
          <div key={p.id} className="rounded-ticket border border-edge bg-white p-4">
            {p.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt="" className="mb-3 w-full rounded-lg object-cover" style={{ maxHeight: 240 }} />
            )}
            <p className="whitespace-pre-wrap">{p.body}</p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-muted">{new Date(p.created_at).toLocaleString()}</p>
              <div className="flex gap-3 text-xs font-semibold">
                <button onClick={() => startEdit(p)} className="text-brand">Edit</button>
                <button onClick={() => removePost(p.id)} className="text-muted">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
