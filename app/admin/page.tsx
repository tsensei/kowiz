import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, files, auditLogs } from '@/lib/db/schema';
import { sql, count, sum, eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, FileIcon, HardDrive, TrendingUp } from 'lucide-react';
import { AuthButton } from '@/components/auth/auth-button';
import { AdminTabs } from '@/components/admin-tabs';
import { logAudit } from '@/lib/audit';

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function getAdminStats() {
  // Get total users count
  const [usersCount] = await db
    .select({ count: count() })
    .from(users);

  // Get total files count
  const [filesCount] = await db
    .select({ count: count() })
    .from(files);

  // Get total storage used (original files)
  const [storageStats] = await db
    .select({
      totalSize: sum(files.size),
      convertedSize: sum(files.convertedSize)
    })
    .from(files);

  // Get files by status
  const filesByStatus = await db
    .select({
      status: files.status,
      count: count()
    })
    .from(files)
    .groupBy(files.status);

  // Get files by category
  const filesByCategory = await db
    .select({
      category: files.category,
      count: count()
    })
    .from(files)
    .groupBy(files.category);

  // Get per-user analytics with file counts and storage usage
  const userAnalytics = await db
    .select({
      userId: users.id,
      username: users.username,
      email: users.email,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      fileCount: sql<number>`CAST(COUNT(${files.id}) AS INTEGER)`,
      totalStorage: sql<string>`COALESCE(SUM(${files.size}), 0)`,
      convertedStorage: sql<string>`COALESCE(SUM(${files.convertedSize}), 0)`,
    })
    .from(users)
    .leftJoin(files, eq(users.id, files.userId))
    .groupBy(users.id, users.username, users.email, users.isAdmin, users.createdAt, users.lastLoginAt)
    .orderBy(desc(users.createdAt))
    .limit(20);

  // Get recent audit logs (last 50)
  const recentAuditLogs = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  return {
    users: {
      total: usersCount.count,
      analytics: userAnalytics.map(u => ({
        ...u,
        totalStorage: Number(u.totalStorage),
        convertedStorage: Number(u.convertedStorage),
      })),
    },
    files: {
      total: filesCount.count,
      byStatus: filesByStatus,
      byCategory: filesByCategory,
    },
    storage: {
      totalSize: Number(storageStats.totalSize) || 0,
      convertedSize: Number(storageStats.convertedSize) || 0,
    },
    auditLogs: recentAuditLogs,
  };
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  // Redirect if not authenticated
  if (!session?.user) {
    redirect('/auth/signin');
  }

  // Redirect if not admin
  if (!session.user.isAdmin) {
    redirect('/');
  }

  // Fetch stats on the server
  const stats = await getAdminStats();

  // Log admin access
  await logAudit({
    userId: session.user.id,
    username: session.user.username,
    action: 'admin.access',
    resourceType: 'system',
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b bg-white dark:bg-slate-900 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto py-4 px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-600 rounded-lg">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Admin Dashboard</h1>
                <p className="text-xs text-muted-foreground">KOWiz Administration</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AuthButton />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto py-8 px-6 max-w-7xl">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.users.total}</div>
              <p className="text-xs text-muted-foreground">Registered accounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Files</CardTitle>
              <FileIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.files.total}</div>
              <p className="text-xs text-muted-foreground">Files processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBytes(Number(stats.storage.totalSize))}
              </div>
              <p className="text-xs text-muted-foreground">Original files</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Converted Storage</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBytes(Number(stats.storage.convertedSize))}
              </div>
              <p className="text-xs text-muted-foreground">Processed files</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs - Client Component */}
        <AdminTabs stats={stats} />
      </main>
    </div>
  );
}
