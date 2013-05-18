# Basic Makefile

UUID = wikipedia_search_provider@awamper.gmail.com
BASE_MODULES = extension.js stylesheet.css metadata.json
EXTRA_MODULES = convenience.js prefs.js wikipedia.png
TOLOCALIZE = extension.js prefs.js
MSGSRC = $(wildcard po/*.po)

all: extension

clean:
	rm -f ./schemas/gschemas.compiled

extension: ./schemas/gschemas.compiled $(MSGSRC:.po=.mo)

./schemas/gschemas.compiled: ./schemas/org.gnome.shell.extensions.wikipedia-search-provider.gschema.xml
	glib-compile-schemas ./schemas/

potfile: ./po/wikipedia_search_provider.pot

mergepo: potfile
	for l in $(MSGSRC); do \
		msgmerge -U $$l ./po/wikipedia_search_provider.pot; \
	done;

./po/wikipedia_search_provider.pot: $(TOLOCALIZE)
	mkdir -p po
	xgettext -k_ -kN_ -o po/wikipedia_search_provider.pot --package-name "Wikipedia Search Provier" $(TOLOCALIZE)

./po/%.mo: ./po/%.po
	msgfmt -c $< -o $@

install: install-local

zip-file: _build
	cd _build ; \
	zip -qr "$(UUID).zip" .
	mv _build/$(UUID).zip ./
	-rm -fR _build

_build: all
	-rm -fR ./_build 
	mkdir -p _build 
	cp $(BASE_MODULES) $(EXTRA_MODULES) _build
	mkdir -p _build/schemas
	cp schemas/*.xml _build/schemas/
	cp schemas/gschemas.compiled _build/schemas/
	mkdir -p _build/locale
	for l in $(MSGSRC:.po=.mo) ; do \
		lf=_build/locale/`basename $$l .mo`; \
		mkdir -p $$lf; \
		mkdir -p $$lf/LC_MESSAGES; \
		cp $$l $$lf/LC_MESSAGES/wikipedia_search_provider.mo; \
	done;


#What does the first "-" mean at the beginning of the line in a Makefile ? 
#It means that make itself will ignore any error code from rm. 
#In a makefile, if any command fails then the make process itself discontinues 
#processing. By prefixing your commands with -, you notify make that it should 
#continue processing rules no matter the outcome of the command.

#mkdir -p, --parents no error if existing, make parent directories as needed 
