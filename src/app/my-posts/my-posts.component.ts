import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-my-posts',
  templateUrl: './my-posts.component.html',
  styleUrls: ['./my-posts.component.scss']
})
export class MyPostsComponent implements OnInit {

  twitter = {
    connected: false,
    feed: false,
  };
  linkedin = {
    connected: false,
    feed: false,
  };
  facebook = {
    connected: false,
    feed: false,
  };

  user: any = {};
  twitterPosts: any = [];
  linkedinPosts: any = [];
  facebookPosts: any = [];

  twitterError: any = false;
  
  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    let headers = new HttpHeaders().set("Authorization", "auth-token");
    this.http.get("api/user", { headers }).subscribe(data => {
      this.user = data
      this.twitter = {
        connected: (typeof this.user.twitterProfile !== "undefined" && this.user.twitterProfile !== null) ? true : false,
        feed: (typeof this.user.twitterProfile !== "undefined" && this.user.twitterProfile !== null) ? true : false
      }
      this.linkedin = {
        connected: (typeof this.user.linkedinProfile !== "undefined" && this.user.linkedinProfile !== null) ? true : false,
        feed: (typeof this.user.linkedinProfile !== "undefined" && this.user.linkedinProfile !== null) ? true : false
      }
      this.facebook = {
        connected: (typeof this.user.facebookProfile !== "undefined" && this.user.facebookProfile !== null) ? true : false,
        feed: (typeof this.user.facebookProfile !== "undefined" && this.user.facebookProfile !== null) ? true : false,
      }
      if(this.twitter.connected) this.http.get("api/myposts", { headers }).subscribe((posts: any) => {
        if(posts.success === false) {
          this.twitterError = posts.message;
        }
        else {
          this.twitterPosts = posts;
          this.twitterError = false;
        }
      })
    });
  }

  toggleFeed(e) {
      if(e === "single") {
        document.querySelector("main").classList.add("single-feed");
      }
      else {
        document.querySelector("main").classList.remove("single-feed");
      }
  }

  togglePlatforms(platform) {
    switch(platform.name) {
      case "twitter":
        this.twitter.feed = platform.active;
        break;
      case "linkedin":
        this.linkedin.feed = platform.active;
        break;
      case "facebook":
        this.facebook.feed = platform.active;
        break;
    }
  }
}