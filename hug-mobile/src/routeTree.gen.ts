/* eslint-disable */
// @ts-nocheck
// Auto-generated route tree snapshot for HUG Mobile.

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as JobJobIdRouteImport } from './routes/job.$jobId'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)
const JobJobIdRoute = JobJobIdRouteImport.update({
  id: '/job/$jobId',
  path: '/job/$jobId',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/job/$jobId': typeof JobJobIdRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/job/$jobId': typeof JobJobIdRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/job/$jobId': typeof JobJobIdRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/job/$jobId'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/job/$jobId'
  id: '__root__' | '/' | '/job/$jobId'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  JobJobIdRoute: typeof JobJobIdRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/job/$jobId': {
      id: '/job/$jobId'
      path: '/job/$jobId'
      fullPath: '/job/$jobId'
      preLoaderRoute: typeof JobJobIdRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute,
  JobJobIdRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}
