import { query } from '@angular/animations';
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { EntryComponent } from './entry/entry.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { IndexComponent } from './index/index.component';
import { MissingPageComponent } from './missing-page/missing-page.component';
import { MyAccountComponent } from './my-account/my-account.component';
import { MyFeedComponent } from './my-feed/my-feed.component';
import { NewPostComponent } from './new-post/new-post.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';
import { SearchComponent } from './search/search.component';

const routes: Routes = [
  { path: "", component: IndexComponent },
  { path: "entry", component: EntryComponent },
  { path: "forgot-password", component: ForgotPasswordComponent },
  { path: "reset-password", component: ResetPasswordComponent, data: {query: query} },
  { path: "my-feed", component: MyFeedComponent },
  { path: "new-post", component: NewPostComponent },
  { path: "my-account", component: MyAccountComponent, data: { query: query } },
  { path: "search", component: SearchComponent },
  { path: '**', component: MissingPageComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
