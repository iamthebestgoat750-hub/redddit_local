export default function PostsPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-white">Posts</h2>
                <p className="text-sm text-[#718096]">Create, schedule, and manage your Reddit posts</p>
            </div>

            <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-16 text-center">
                <div className="text-5xl mb-4">📝</div>
                <h3 className="text-lg font-semibold text-white mb-2">No posts yet</h3>
                <p className="text-sm text-[#718096] mb-6 max-w-md mx-auto">
                    Connect and warmup your account first, then create AI-powered posts for multiple subreddits.
                </p>
                <button className="btn-primary text-sm opacity-50 cursor-not-allowed" disabled>
                    Coming Soon
                </button>
            </div>
        </div>
    );
}
