import { expect, it, vi } from 'vitest';
import { PAGE_CAPABILITIES, type PageDriver, type WebMcpToolRegistration } from '@jini-ai/agentic';
import { registerAdminPageWebMcpTools } from '../admin-page-tools';
import { createAdminPageApprovalStore } from '../admin-page-approval.store';

it('ordinary field edits, navigation and reviewed install controls run directly without native dialogs', async () => {
  const tools: WebMcpToolRegistration[]=[];
  const approvals=createAdminPageApprovalStore({}, {createId:()=> 'approval'});
  const driver: PageDriver={findElements:async()=>[],listPages:async()=>[{id:'plugins',label:'Plugins'}],describeField:async()=>({type:'text'}),highlight:async()=>{},scrollTo:async()=>{},click:vi.fn(async()=>{}),fill:vi.fn(async()=>{}),selectOption:vi.fn(async()=>{}),navigate:vi.fn(async()=>{})};
  registerAdminPageWebMcpTools({driver,signal:new AbortController().signal},{approvals,isEnabled:()=>true,modelContext:{registerTool:async({tool})=>{tools.push(tool as WebMcpToolRegistration);}}});
  const run=(name:string,args:Record<string,unknown>)=>tools.find(tool=>tool.name===name)!.execute(args);
  await run('page.fill',{handle:'plugins-install-folder',text:'/packages/hello'});
  await run('page.navigate',{page:'plugins'});
  await run('page.click',{handle:'plugins-install-confirm'});
  expect(driver.fill).toHaveBeenCalledExactlyOnceWith({handle:'plugins-install-folder',text:'/packages/hello'});
  expect(driver.click).toHaveBeenCalledExactlyOnceWith({handle:'plugins-install-confirm'});
  expect(driver.navigate).toHaveBeenCalledExactlyOnceWith({page:'plugins'});
  expect(approvals.getSnapshot().pending).toBeNull();
  const result=await run('page.click',{handle:'plugin-remove-confirm'});
  expect(result).toMatchObject({status:'approval_required',responseTool:'admin.respond_page_approval'});
  expect(driver.click).toHaveBeenCalledTimes(1);
  await run('admin.respond_page_approval',{approvalId:'approval',approved:false});
  expect(driver.click).toHaveBeenCalledTimes(1);
});
