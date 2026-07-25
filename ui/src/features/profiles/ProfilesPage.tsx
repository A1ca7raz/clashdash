import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import type { ResolvedProfile } from '../../../../src/domain/models/profile.ts'
import { api, post } from '../../api/client.ts'
import { Button, Empty, ErrorNotice } from '../../components/ui.tsx'
import { PageHeader } from '../../components/Layout.tsx'
import { ProfileEditor } from './ProfileEditor.tsx'

export function ProfilesPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api<ResolvedProfile[]>('/api/profiles') })
  const create = useMutation({
    mutationFn: () => post<ResolvedProfile>('/api/profiles', {
      name: `Profile ${(profiles.data?.length ?? 0) + 1}`, tags: [], generalConfig: { mode: 'rule' },
      selectedNodes: [], listeners: [], proxyGroups: [],
      ruleEntries: [{ type: 'rule', rule: { type: 'MATCH', parameters: [], policy: 'DIRECT' } }],
      ruleProviders: [], passthroughProviders: [],
    }),
    onSuccess: (value) => {
      void client.invalidateQueries({ queryKey: ['profiles'] })
      navigate(`/profiles/${value.profile.id}`)
    },
  })

  return <>
    <PageHeader
      title="配置文件"
      detail="组合节点、规则、Provider 与入口配置，并发布订阅。"
      actions={<Button onClick={() => create.mutate()} disabled={create.isPending}>＋ 新建 Profile</Button>}
    />
    <ErrorNotice error={profiles.error ?? create.error} />
    {profiles.data?.length
      ? <div className="management-card-grid">{profiles.data.map(({ profile }) => <button
          key={profile.id}
          className="management-card profile-management-card"
          onClick={() => navigate(`/profiles/${profile.id}`)}
        >
          <div><h2>{profile.name}</h2><p>{profile.tags.length ? profile.tags.map((tag) => `#${tag}`).join(' ') : '无 Tag'}</p></div>
          <footer><span>{profile.generalConfig.mode === 'global' ? 'GLOBAL' : 'RULE'} MODE</span><b>打开配置 <i>→</i></b></footer>
        </button>)}</div>
      : !profiles.isLoading && <Empty
          title="还没有 Profile"
          detail="创建 Profile 后，在独立详情页组合节点、规则与 Provider。"
          action={<Button onClick={() => create.mutate()}>新建第一个 Profile</Button>}
        />}
  </>
}

export function ProfileDetailPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const { id } = useParams()
  const profile = useQuery({
    queryKey: ['profiles', id],
    queryFn: () => api<ResolvedProfile>(`/api/profiles/${id}`),
    enabled: Boolean(id),
  })

  function refresh() {
    void Promise.all([
      client.invalidateQueries({ queryKey: ['profiles'] }),
      client.invalidateQueries({ queryKey: ['profiles', id] }),
    ])
  }

  return <>
    <PageHeader
      title={profile.data?.profile.name ?? '配置详情'}
      detail="编辑 Profile 聚合内容、检查编译结果并管理订阅 Token。"
      actions={<Button variant="quiet" onClick={() => navigate('/profiles')}>← 返回列表</Button>}
    />
    <ErrorNotice error={profile.error} />
    <div className="profile-detail-workspace">
      {profile.data
        ? <ProfileEditor
            key={profile.data.profile.id}
            value={profile.data}
            onChanged={refresh}
            onDeleted={() => {
              void client.invalidateQueries({ queryKey: ['profiles'] })
              navigate('/profiles')
            }}
          />
        : !profile.isLoading && !profile.error && <Empty title="Profile 不存在" detail="该 Profile 可能已被删除。" />}
    </div>
  </>
}
