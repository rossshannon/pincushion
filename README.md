# Pincushion

Pincushion is an alternative bookmarklet for [Pinboard](https://pinboard.in) that you can add to your browser, and use to save and edit bookmarks. It is designed to be mobile-friendly, fast and interactive, and harnesses the capabilities of modern browsers to enhance the experience of tagging and saving bookmarks.

## Features

- **Smartphone &amp; tablet-optimised**
Pincushion adapts to the size of your mobile device’s screen, to make reading and editing the form easier, without requiring you to zoom in before you begin. Form elements respond to you as quickly as they would in native mobile apps.
- **Interactive**
The form is enhanced with animation to guide interaction, and more clearly explain what is happening while you edit and save your bookmarks.
- **Easily add tags**
Pincushion uses as intelligent autocomplete widget that shows the tags you’ve previously used, along with the number of times you’ve used them. The autocomplete even lets you search within your tags without having to type the exact letters that a tag begins with.
- **Search across *all* of your tags**
The first time you use Pincushion, it downloads a local copy of all of your tags into your browser’s “LocalStorage”, which allows you to store about 2.5MB of data and preferences for each site you use regularly. This means that from then on, the autocomplete widget can search across your entire collection. The autocomplete can use each tag’s score to be smarter about which tags to suggest to you as you are typing. (Tag autocomplete has been tested on a data set of over 11,000 tags, which totalled 180KB when downloaded.)

## Installing the Bookmarklet

To use the bookmarklet, you will need to have an account on http://pinboard.in. When logged in, visit your [password settings page](https://pinboard.in/settings/password) to locate your API token — it will be in the form

    username:462E2B102D4CCDE36662

Your API token is a way to grant applications or websites the ability to send bookmarks to your Pinboard account, without having to give them your password.

To add the bookmarklet to your browser, simply add a new bookmark, give it any name you want, and use the following text as the URL:

    javascript:q=location.href;d=(window.getSelection?window.getSelection():document.getSelection?document.getSelection():document.selection.createRange().text);p=document.title;void(open('https://rossshannon.github.io/pincushion/?user=USERNAME&token=API_TOKEN&url='+encodeURIComponent(q)+'&description='+encodeURIComponent(d)+'&title='+encodeURIComponent(p),'Pinboard','toolbar=yes,width=600,height=700,left=50,top=50'));

Often the easiest way to do this is to bookmark the page you’re currently reading, and then edit this bookmark and replace the URL with the above code. Replace `USERNAME` with your Pinboard username, and `API_TOKEN` with your 20-character API token and you’re all set. Click the bookmarklet and it will open the Pincushion interface.

You can also pre-check the “private” and “to read” checkboxes by passing these properties with the value `true`:

    javascript:q=location.href;d=(window.getSelection?window.getSelection():document.getSelection?document.getSelection():document.selection.createRange().text);p=document.title;void(open('https://rossshannon.github.io/pincushion/?user=USERNAME&token=API_TOKEN&url='+encodeURIComponent(q)+'&description='+encodeURIComponent(d)+'&title='+encodeURIComponent(p)+'&private=true&toread=true','Pinboard','toolbar=yes,width=600,height=700,left=50,top=50'));

### Browser Support

Pincushion is designed for modern browsers like Chrome, Safari, Firefox, Internet Explorer 10+, and mobile varieties of Safari and Chrome. Earlier versions of Internet Explorer have problems with the cross-domain Ajax required.

#### Running Locally

- Clone the repository to your computer. `git clone https://github.com/rossshannon/pincushion.git`
- Switch into the new directory and run `yarn install` or `npm install`
- Install the `foreman` gem using `gem install foreman`, and then run the `Procfile` using `foreman start`. Grunt will build the required packages and a server will be booted to run Pincushion on localhost port 5000 (http://localhost:5000).

## Changelog

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

Copyright &copy; 2014–2017 [Ross Shannon](http://twitter.com/rossshannon).

Pincushion is open source software, [licensed](LICENSE) under the MIT License. Suggestions and pull requests are welcome.

## Acknowledgements

Pincushion uses a number of excellent open source libraries.
- [jQuery](https://github.com/jquery/jquery) (2.1.0).
- [selectize.js](https://brianreavis.github.io/selectize.js/) autocomplete library for tagging.
- [Pinboard-Bridge](https://github.com/aaronpowell/pinboard-bridge), a Node.js-based wrapper which allows use of the Pinboard API with Ajax methods, as the API does not natively support [cross-origin resource sharing (CORS)](https://groups.google.com/d/topic/pinboard-dev/RtyJC1Gm67E/discussion). An instance of pinboard-bridge is deployed for use on [Heroku](https://www.heroku.com/) (https://pinboard-api.herokuapp.com/).
- [Ladda](https://github.com/hakimel/Ladda) for the submit buttons with integrated progress indicators.
- [Grunt](http://gruntjs.com/) for building and asset management, and [LESS](http://lesscss.org/) for CSS.
