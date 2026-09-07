"""
Die Zeitrechnung. Alles, was hier steht, entscheidet über Zahlen, die jemand
später einem Fördergeber vorlegt.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from socos.services import zeit


class TestRundung:
    def test_rundet_auf_fuenf_minuten(self):
        assert zeit.auf_fuenf_minuten(0) == 0
        assert zeit.auf_fuenf_minuten(60) == 0
        assert zeit.auf_fuenf_minuten(200) == 300
        assert zeit.auf_fuenf_minuten(420) == 300
        assert zeit.auf_fuenf_minuten(480) == 600

    def test_genau_zweieinhalb_minuten_gehen_auf(self):
        """Sonst verschwände über eine Woche eine Viertelstunde echter Arbeit."""
        assert zeit.auf_fuenf_minuten(150) == 300

    def test_summiert_erst_und_rundet_dann(self):
        # Drei Buchungen zu je zwei Minuten sind zusammen sechs, also fünf
        # gerundet. Einzeln gerundet wären es null.
        assert zeit.summe_gerundet([120, 120, 120]) == 300
        assert sum(zeit.auf_fuenf_minuten(s) for s in [120, 120, 120]) == 0

    def test_negatives_wird_null(self):
        assert zeit.auf_fuenf_minuten(-500) == 0

    def test_stunden_sind_decimal_nie_float(self):
        """
        Geld und Zeit sind Decimal. Bei Stunden, die über ein Jahr zu einem
        Nachweis summiert werden, sind float-Differenzen nicht zuordenbar.
        """
        ergebnis = zeit.als_stunden(12_300)
        assert isinstance(ergebnis, Decimal)
        assert ergebnis == Decimal("3.42")

    def test_stimmt_mit_dem_frontend_ueberein(self):
        """
        Dieselben Werte prüft frontend/src/basis/zeit.test.ts. Laufen die
        beiden auseinander, zeigt die Oberfläche etwas anderes als der
        Zeitnachweis.
        """
        for sekunden, erwartet in [(0, 0), (60, 0), (150, 300), (200, 300), (420, 300), (480, 600)]:
            assert zeit.auf_fuenf_minuten(sekunden) == erwartet
        assert zeit.als_dauer(12_300) == "3:25"


class TestTagesende:
    def test_ist_der_letzte_moment_des_tages(self):
        start = timezone.make_aware(datetime(2026, 3, 10, 22, 30))
        ende = zeit.tagesende(start)
        lokal = timezone.localtime(ende)
        assert (lokal.date(), lokal.hour, lokal.minute) == (date(2026, 3, 10), 23, 59)

    def test_ueberlebt_die_zeitumstellung(self):
        """
        Nicht start + 24 h: An den Umstellungstagen hat ein Tag 23 oder 25
        Stunden, und die Buchung landete sonst eine Stunde daneben.
        """
        # 29.03.2026 ist in Österreich die Umstellung auf Sommerzeit.
        start = timezone.make_aware(datetime(2026, 3, 29, 10, 0))
        lokal = timezone.localtime(zeit.tagesende(start))
        assert lokal.date() == date(2026, 3, 29)
        assert (lokal.hour, lokal.minute) == (23, 59)
        assert zeit.tagesende(start) - start != timedelta(hours=13, minutes=59)


class TestWoche:
    def test_geht_von_montag_bis_sonntag(self):
        montag, sonntag = zeit.woche_um(date(2026, 9, 9))  # ein Mittwoch
        assert montag == date(2026, 9, 7)
        assert sonntag == date(2026, 9, 13)


class TestMonatsgrenzen:
    def test_findet_ersten_und_letzten(self):
        assert zeit.monatsgrenzen(date(2026, 2, 15)) == (date(2026, 2, 1), date(2026, 2, 28))
        assert zeit.monatsgrenzen(date(2024, 2, 15)) == (date(2024, 2, 1), date(2024, 2, 29))
        assert zeit.monatsgrenzen(date(2026, 12, 3)) == (date(2026, 12, 1), date(2026, 12, 31))


class TestDeutscheSchreibweise:
    def test_stunden_mit_komma(self):
        """
        Der Punkt aus str(Decimal) ist in einem deutschen Dokument falsch und
        wird beim Übertragen in eine Tabelle zur Fehlerquelle.
        """
        assert zeit.als_stunden_text(12_300) == "3,42"
        assert zeit.als_stunden_text(3600) == "1,00"
        assert zeit.als_stunden_text(0) == "0,00"
