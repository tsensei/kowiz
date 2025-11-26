'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Activity, ScrollText } from 'lucide-react';

interface AdminStats {
  users: {
    total: number;
    analytics: Array<{
      userId: string;
      username: string;
      email: string | null;
      isAdmin: boolean;
      createdAt: Date;
      lastLoginAt: Date;
      fileCount: number;
      totalStorage: number;
      convertedStorage: number;
    }>;
  };
  files: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    byCategory: Array<{ category: string; count: number }>;
  };
  storage: {
    totalSize: number;
    convertedSize: number;
  };
  auditLogs: Array<{
    id: string;
    userId: string | null;
    username: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    metadata: any;
    success: boolean;
    errorMessage: string | null;
    createdAt: Date;
  }>;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function AdminTabs({ stats }: { stats: AdminStats }) {
  return (
    <Tabs defaultValue="users" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3 h-11">
        <TabsTrigger value="users">
          <Users className="h-4 w-4 mr-2" />
          Users
        </TabsTrigger>
        <TabsTrigger value="files">
          <Activity className="h-4 w-4 mr-2" />
          Files Stats
        </TabsTrigger>
        <TabsTrigger value="audit">
          <ScrollText className="h-4 w-4 mr-2" />
          Audit Logs
        </TabsTrigger>
      </TabsList>

      <TabsContent value="users" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>User Analytics</CardTitle>
            <CardDescription>Users with file counts and storage usage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Files</TableHead>
                    <TableHead className="text-right">Storage Used</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.users.analytics.map((user) => (
                    <TableRow key={user.userId}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.email || 'N/A'}</TableCell>
                      <TableCell className="text-right font-mono">{user.fileCount}</TableCell>
                      <TableCell className="text-right font-mono">{formatBytes(user.totalStorage)}</TableCell>
                      <TableCell className="text-right font-mono">{formatBytes(user.convertedStorage)}</TableCell>
                      <TableCell className="text-sm">{formatDate(user.createdAt)}</TableCell>
                      <TableCell className="text-sm">{formatDate(user.lastLoginAt)}</TableCell>
                      <TableCell>
                        {user.isAdmin ? (
                          <Badge variant="destructive">Admin</Badge>
                        ) : (
                          <Badge variant="secondary">User</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="files" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Files by Status</CardTitle>
              <CardDescription>Current processing status distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.files.byStatus.map((item) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Files by Category</CardTitle>
              <CardDescription>Media type distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.files.byCategory.map((item) => (
                  <div key={item.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.category}</Badge>
                    </div>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="audit" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Last 50 audit log entries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Resource ID</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm font-mono whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">{log.username || 'System'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.resourceType}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {log.resourceId ? log.resourceId.substring(0, 8) + '...' : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <Badge variant="default" className="bg-green-600">Success</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
