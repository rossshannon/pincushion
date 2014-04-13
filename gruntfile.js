module.exports = function(grunt) {

  grunt.registerTask('watch', [ 'watch' ]);

  grunt.initConfig({
    browserify: {
      dist: {
        files: {
          'build/module.js': ['popup.js'],
        }
      }
    },
    concat: {
      js: {
        options: {
          separator: ';'
        },
        src: [
          'build/module.js'
        ],
        dest: 'public/js/main.min.js'
      },
    },
    uglify: {
      options: {
        mangle: false
      },
      js: {
        files: {
          'public/js/main.min.js': ['public/js/main.min.js']
        }
      }
    },
    less: {
      style: {
        files: {
          "public/css/style.css": "popup.less"
        }
      }
    },
    watch: {
      js: {
        files: ['*.js'],
        tasks: ['browserify', 'concat:js', 'uglify:js'],
        options: {
          livereload: true,
        }
      },
      css: {
        files: ['*.less'],
        tasks: ['less:style'],
        options: {
          livereload: true,
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-watch');
};
