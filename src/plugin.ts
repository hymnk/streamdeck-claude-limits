import streamDeck from "@elgato/streamdeck";
import { LimitsAction } from "./actions/limits";

streamDeck.actions.registerAction(new LimitsAction());
streamDeck.connect();
