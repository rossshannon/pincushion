# Pincushion

Pincushion is an alternative bookmarklet for [Pinboard](https://pinboard.in) that you can add to your browser, and use to save and edit bookmarks. It is designed to be mobile-friendly, fast and interactive, and harnesses the capabilities of modern browsers to enhance the experience of tagging and saving bookmarks.

## Features

- **Smartphone &amp; tablet-optimised**
  Pincushion adapts to the size of your mobile device’s screen, to make reading and editing the form easier, without requiring you to zoom in before you begin. Form elements respond to you as quickly as they would in native mobile apps.
- **Interactive**
  The form is enhanced with animation to guide interaction, and more clearly explain what is happening while you edit and save your bookmarks.
- **Easily add tags**
  Pincushion uses as intelligent autocomplete widget that shows the tags you’ve previously used, along with the number of times you’ve used them. The autocomplete even lets you search within your tags without having to type the exact letters that a tag begins with.
- **Search across _all_ of your tags**
  The first time you use Pincushion, it downloads a local copy of all of your tags into your browser’s “LocalStorage”, which allows you to store about 2.5MB of data and preferences for each site you use regularly. This means that from then on, the autocomplete widget can search across your entire collection.
  The autocomplete can use each tag’s score to be smarter about which tags to suggest to you as you are typing. (Tag autocomplete has been tested on a data set of over 12,500 tags, which totalled 184KB when downloaded.)
- **AI-based tag suggestions**
  When bookmarking a new page, the form will suggest tags based on your previous usage, other Pinboard members tags for that same page, as well as optionally using AI to propose relevant tags.

![Pincushion bookmarking interface](https://github.com/rossshannon/pincushion/raw/master/public/images/pincushion-bookmarking-interface.png)

## Installing the Bookmarklet

To use the bookmarklet, you will need to have an account on http://pinboard.in and an API token. Your API token is a way to grant applications or websites the ability to send bookmarks to your Pinboard account, without having to give them your password.

When logged in, visit your [password settings page](https://pinboard.in/settings/password) to locate your API token — it will be in the form

    username:462E2B102D4CCDE36662

The part after the colon is the API token (`462E2B102D4CCDE36662` in this example).

To add the bookmarklet to your browser, simply add a new bookmark, give it any name you want, and use the following text as the URL:

    javascript:q=location.href;d=(window.getSelection?window.getSelection():document.getSelection?document.getSelection():document.selection.createRange().text);p=document.title;void(open('https://rossshannon.github.io/pincushion/?url='+encodeURIComponent(q)+'&description='+encodeURIComponent(d)+'&title='+encodeURIComponent(p),'Pinboard','toolbar=yes,width=600,height=700,left=50,top=50'));

Often the easiest way to do this is to bookmark the page you’re currently reading, and then edit this bookmark and replace the URL with the above code. Click the bookmarklet in your browser’s bookmarks bar and it will open the Pincushion interface. The first time you run, you’ll be prompted to enter your Pinboard credentials and optionally an OpenAI API token for AI-powered tag suggestions.

![Pincushion bookmarklet in browser bookmarks bar](https://github.com/rossshannon/pincushion/raw/master/public/images/pincushion-icon-bookmarks-bar.png)

You can also pre-check the “private” and “to read” checkboxes by passing these properties with the value `true`:

    javascript:q=location.href;d=(window.getSelection?window.getSelection():document.getSelection?document.getSelection():document.selection.createRange().text);p=document.title;void(open('https://rossshannon.github.io/pincushion/?url='+encodeURIComponent(q)+'&description='+encodeURIComponent(d)+'&title='+encodeURIComponent(p)+'&private=true&toread=true','Pinboard','toolbar=yes,width=600,height=700,left=50,top=50'));

### Configuring Credentials

When the popup opens you’ll now see a gear button in the footer. Click it to open the Settings page, where you can enter your Pinboard username, Pinboard API token, and (optionally) an OpenAI API token for GPT-powered tag suggestions. These values are stored locally via `localStorage` in your browser’s secure storage, keeping your credentials out of browser history and referrers. You can update or remove the tokens at any time from the same Settings view.

### Browser Support

Pincushion is designed for modern browsers like Chrome, Safari, Comet, Atlas, Edge, Firefox, and mobile varieties of Safari and Chrome.

It supports Internet Explorer 10+, but earlier versions of Internet Explorer have problems with the cross-domain Ajax required.

#### Running Locally

- Clone the repository to your computer. `git clone https://github.com/rossshannon/pincushion.git`
- Switch into the new directory and run `yarn install` or `npm install`
- Run `npm start` to start the development server. A web server will be booted to run Pincushion on localhost port 3000 (http://localhost:3000).

## Changelog

### 2.2 (2025-11-14)

- Add dark mode.

### 2.1 (2025-11-14)

- Add a settings page to configure the credentials securely in the browser rather than in the bookmarklet URL.

### 2.0 (2025-11-12)

- Fully refactor the codebase to use React, Redux, and TypeScript.
- Many usability and performance improvements.

### 1.6 (2023-10-18)

- Add optional AI-based tag suggestions using OpenAI APIs.

### 1.5 (2023-10-14)

- Detect URL fragments (hashes) in URLs and give support to remove them if desired, so that canonical URLs are being bookmarked instead of sections of documents.

### 1.4 (2023-10-08)

- Revamp build process and dependencies. Improve how tag suggestions are handled.

### 1.3 (2021-06-14)

- Added options to set the “private” and “to read” options to true by default via the bookmarklet URL.

### 1.2 (2017-09-10)

- Switched to a self-hosted version of the Pinboard API bridge to avoid occasional downtime or slow requests.
- Updated development dependencies and added instructions for running locally.

### 1.1 (2016-01-3)

- Improve tag sorting so that tags that are used more frequently will be sorted higher in the autocomplete list.
- Allow autocomplete to match tags while ignoring punctuation (for example, typing “theo” will now match “the_onion”).

### 1.0 (2014-10-04)

- Local tag storage, autocomplete-based tag suggestions, Pinboard API integration, mobile compatibility, usability improvements and error-handling.

### Project started (2014-04-04)

## License

Copyright &copy; 2014–2025 [Ross Shannon](http://twitter.com/rossshannon).

Pincushion is open source software, [licensed](LICENSE) under the MIT License. Suggestions and pull requests are welcome.

## Acknowledgements

Pincushion uses a number of excellent open source libraries.

- [react-select](https://react-select.com/) for the tag autocomplete experience.
- [Ladda](https://github.com/hakimel/Ladda) for the submit buttons with integrated progress indicators.
- [Pinboard-Bridge](https://github.com/aaronpowell/pinboard-bridge), a Node.js-based wrapper which allows use of the Pinboard API with Ajax methods, as the API does not natively support [cross-origin resource sharing (CORS)](https://groups.google.com/d/topic/pinboard-dev/RtyJC1Gm67E/discussion). An instance of pinboard-bridge is deployed for use on [Heroku](https://www.heroku.com/) (https://pinboard-api.herokuapp.com/).
